import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { captureLogs } from '../../support/logs.js';
import { runSeed } from '../../../scripts/seed.js';
import { NewsletterSubscriber } from '../../../src/models/index.js';
import { setMailer } from '../../../src/services/notify.service.js';
import { setCaptcha } from '../../../src/services/captcha.service.js';
import type { SentMail } from '../../../src/interfaces/integrations/mailer.interface.js';

/**
 * The newsletter's double opt-in (ADR-065).
 *
 * The properties worth pinning: nothing is on the list until the emailed link
 * is followed; the subscribe response never reveals whether an address is
 * known; each link does its one job; and no address reaches the log.
 */

setupTestDb();

const app = buildTestApp();

const sent: SentMail[] = [];

const EMAIL = 'adaeze.nwosu@example.com';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();

  sent.length = 0;
  setMailer({
    name: 'test',
    send: (mail: SentMail) => {
      sent.push(mail);
      return Promise.resolve();
    },
  });
  setCaptcha({ name: 'test', verify: () => Promise.resolve(true) });
});

const body = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  email: EMAIL,
  consent: true,
  consentTextVersion: '2026-10',
  turnstileToken: 'test',
  ...overrides,
});

/** The token from the link in the last email sent. */
const lastToken = (): string => {
  const match = /token=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)?.text ?? '');
  if (!match?.[1]) throw new Error('the last email carried no token');
  return match[1];
};

const subscribeAndConfirm = async (): Promise<void> => {
  await request(app).post('/api/v1/newsletter/subscriptions').send(body());
  await request(app).post('/api/v1/newsletter/confirm').send({ token: lastToken() });
};

describe('subscribing', () => {
  it('stores a pending address and emails it a confirmation link', async () => {
    const logs = captureLogs();
    const res = await request(app).post('/api/v1/newsletter/subscriptions').send(body());
    const written = logs.release();

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/subscriptions');

    const stored = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(stored?.status).toBe('pending');
    expect(stored?.consent.textVersion).toBe('2026-10');
    expect(stored?.expiresAt).toBeInstanceOf(Date);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(EMAIL);
    expect(sent[0]?.text).toContain('http://localhost:3000/newsletter/confirm?token=');
    // Only a hash of the confirmation token is kept.
    expect(stored?.confirmTokenHash).not.toBe(lastToken());

    expect(written).not.toContain(EMAIL);
  });

  it('refuses a subscription without consent', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscriptions')
      .send(body({ consent: false }));

    expect(res.status).toBe(400);
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
  });

  it('accepts a bot that filled the honeypot and stores and sends nothing', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscriptions')
      .send(body({ website: 'https://spam.example' }));

    expect(res.status).toBe(202);
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('answers an existing subscriber exactly as a new one, and reminds them by email', async () => {
    await subscribeAndConfirm();
    const before = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    sent.length = 0;

    const res = await request(app)
      .post('/api/v1/newsletter/subscriptions')
      .send(body({ email: 'Adaeze.Nwosu@Example.com' }));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { status: 'confirmation_sent' } });

    const after = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(after?.status).toBe('subscribed');
    expect(after?.subscribedAt).toEqual(before?.subscribedAt);
    expect(sent[0]?.subject).toContain('already subscribed');
    expect(sent[0]?.text).toContain('/newsletter/unsubscribe?token=');
  });
});

describe('confirming', () => {
  it('puts the address on the list and sends the unsubscribe link', async () => {
    await request(app).post('/api/v1/newsletter/subscriptions').send(body());

    const res = await request(app).post('/api/v1/newsletter/confirm').send({ token: lastToken() });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/confirm');

    const stored = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(stored?.status).toBe('subscribed');
    expect(stored?.subscribedAt).toBeInstanceOf(Date);
    // A subscriber is kept until they leave.
    expect(stored?.expiresAt).toBeNull();
    expect(sent.at(-1)?.text).toContain(
      `/newsletter/unsubscribe?token=${stored?.unsubscribeToken}`
    );
  });

  it('refuses a malformed token', async () => {
    const res = await request(app).post('/api/v1/newsletter/confirm').send({ token: 'short' });

    expect(res.status).toBe(400);
  });

  it('is a 404 for a link already used', async () => {
    await request(app).post('/api/v1/newsletter/subscriptions').send(body());
    const token = lastToken();
    await request(app).post('/api/v1/newsletter/confirm').send({ token });

    const res = await request(app).post('/api/v1/newsletter/confirm').send({ token });

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/confirm');
  });

  it('is a 404 for a link past its 7 days, even before the TTL monitor deletes it', async () => {
    await request(app).post('/api/v1/newsletter/subscriptions').send(body());
    await NewsletterSubscriber.updateOne(
      { email: EMAIL },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app).post('/api/v1/newsletter/confirm').send({ token: lastToken() });

    expect(res.status).toBe(404);
  });
});

describe('unsubscribing', () => {
  it('takes the address off the list, and a repeat click still succeeds', async () => {
    await subscribeAndConfirm();
    const token = lastToken();

    const res = await request(app).post('/api/v1/newsletter/unsubscribe').send({ token });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/unsubscribe');

    const stored = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(stored?.status).toBe('unsubscribed');
    expect(stored?.expiresAt).toBeInstanceOf(Date);

    const again = await request(app).post('/api/v1/newsletter/unsubscribe').send({ token });
    expect(again.status).toBe(200);
  });

  it('refuses a malformed token', async () => {
    const res = await request(app).post('/api/v1/newsletter/unsubscribe').send({});

    expect(res.status).toBe(400);
  });

  it('asks a returning address to confirm again before it is back on the list', async () => {
    await subscribeAndConfirm();
    await request(app).post('/api/v1/newsletter/unsubscribe').send({ token: lastToken() });

    await request(app).post('/api/v1/newsletter/subscriptions').send(body());

    const stored = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(stored?.status).toBe('pending');
    expect(stored?.unsubscribedAt).toBeNull();
    expect(sent.at(-1)?.text).toContain('/newsletter/confirm?token=');
  });
});
