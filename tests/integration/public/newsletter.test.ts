import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { captureLogs } from '../../support/logs.js';
import { NewsletterSubscriber } from '../../../src/models/index.js';
import { setCaptcha } from '../../../src/services/captcha.service.js';

/**
 * The newsletter (ADR-067): an address goes on the list when submitted and
 * comes off when its owner asks. Worth pinning: consent is stored as proof,
 * neither answer reveals who is subscribed, and no address reaches the log.
 */

setupTestDb();

const app = buildTestApp();

const EMAIL = 'adaeze.nwosu@example.com';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(() => {
  setCaptcha({ name: 'test', verify: () => Promise.resolve(true) });
});

const body = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  email: EMAIL,
  consent: true,
  consentTextVersion: '2026-10',
  turnstileToken: 'test',
  ...overrides,
});

const subscribe = (overrides: Record<string, unknown> = {}): request.Test =>
  request(app).post('/api/v1/newsletter/subscriptions').send(body(overrides));

describe('subscribing', () => {
  it('puts the address on the list with its consent, and logs no address', async () => {
    const logs = captureLogs();
    const res = await subscribe();
    const written = logs.release();

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/subscriptions');

    const stored = await NewsletterSubscriber.findOne({ email: EMAIL }).lean();
    expect(stored?.consent.textVersion).toBe('2026-10');
    expect(stored?.consent.at).toBeInstanceOf(Date);
    expect(written).not.toContain(EMAIL);
  });

  it('refuses a subscription without consent', async () => {
    const res = await subscribe({ consent: false });

    expect(res.status).toBe(400);
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
  });

  it('accepts a bot that filled the honeypot and stores nothing', async () => {
    const res = await subscribe({ website: 'https://spam.example' });

    expect(res.status).toBe(201);
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
  });

  it('treats a repeat as success, keeping one record with the latest consent', async () => {
    await subscribe();
    const res = await subscribe({
      email: 'Adaeze.Nwosu@Example.com',
      consentTextVersion: '2026-11',
    });

    expect(res.status).toBe(201);
    const stored = await NewsletterSubscriber.find({ email: EMAIL }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.consent.textVersion).toBe('2026-11');
  });
});

describe('unsubscribing', () => {
  it('removes the address from the list', async () => {
    await subscribe();

    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: 'ADAEZE.NWOSU@example.com' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'post', '/api/v1/newsletter/unsubscribe');
    expect(await NewsletterSubscriber.countDocuments()).toBe(0);
  });

  it('answers the same for an address that was never on the list', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'unsubscribed' } });
  });

  it('refuses something that is not an email address', async () => {
    const res = await request(app).post('/api/v1/newsletter/unsubscribe').send({ email: 'nope' });

    expect(res.status).toBe(400);
  });
});
