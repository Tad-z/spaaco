import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Enquiry, Message, Office, PracticeArea } from '../../../src/models/index.js';
import { setMailer } from '../../../src/services/notify.service.js';
import { setCaptcha } from '../../../src/services/captcha.service.js';
import { captureLogs } from '../../support/logs.js';
import { config } from '../../../src/config/env.js';
import type { SentMail } from '../../../src/interfaces/integrations/mailer.interface.js';

/**
 * The two JSON forms.
 *
 * Almost everything here is a rule from `.claude/rules/submissions.md` rather
 * than a feature: consent is proof, not a checkbox; a bot must not learn it
 * was caught; the firm's notification carries no personal data; and nothing
 * anyone typed may reach the log. Those are the assertions worth having.
 */

setupTestDb();

const app = buildTestApp();

const sent: SentMail[] = [];

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

const enquiry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  fullName: 'Adaeze Nwosu',
  email: 'adaeze.nwosu@example.com',
  phone: '+2348030000000',
  organization: 'Meridian Capital Partners',
  summary:
    'We are preparing a bond issuance and need counsel on the SEC filing timetable and the related corporate restructuring.',
  consent: true,
  consentTextVersion: '2026-01',
  turnstileToken: 'test',
  ...overrides,
});

const message = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  fullName: 'Ibrahim Danladi',
  email: 'ibrahim.danladi@example.com',
  subject: 'Question about an existing matter',
  message: 'Could someone confirm who is handling our trademark renewal this quarter?',
  consent: true,
  consentTextVersion: '2026-01',
  turnstileToken: 'test',
  ...overrides,
});

describe('submitting a mandate enquiry', () => {
  it('stores it and returns only a reference', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiry());

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/enquiries');

    expect(res.body.data.reference).toMatch(/^ENQ-[0-9A-HJ-NP-Z]{6}$/);
    // Nothing the submitter typed comes back, so a shared screen shows nothing.
    expect(JSON.stringify(res.body)).not.toContain('adaeze.nwosu@example.com');

    const stored = await Enquiry.findOne({ reference: res.body.data.reference }).lean();
    expect(stored?.fullName).toBe('Adaeze Nwosu');
    expect(stored?.status).toBe('new');
  });

  it('resolves the practice area and office the submitter chose', async () => {
    const area = await PracticeArea.findOne({ slug: 'tax' }).lean();
    const office = await Office.findOne({ slug: 'lagos' }).lean();

    const res = await request(app)
      .post('/api/v1/enquiries')
      .send(enquiry({ practiceArea: 'tax', preferredOffice: office?._id.toString() }));

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const stored = await Enquiry.findOne({ reference: res.body.data.reference }).lean();
    expect(stored?.practiceArea?.toString()).toBe(area?._id.toString());
    expect(stored?.preferredOffice?.toString()).toBe(office?._id.toString());
  });

  it('records consent as proof, with the wording version and a timestamp', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiry());
    const stored = await Enquiry.findOne({ reference: res.body.data.reference }).lean();

    expect(stored?.consent.given).toBe(true);
    expect(stored?.consent.textVersion).toBe('2026-01');
    expect(stored?.consent.at).toBeInstanceOf(Date);
  });

  it('refuses a submission without consent', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .send(enquiry({ consent: false }));

    expect(res.status).toBe(400);
    expect(await Enquiry.countDocuments()).toBe(0);
  });

  it('refuses a submission the captcha rejects', async () => {
    setCaptcha({ name: 'test', verify: () => Promise.resolve(false) });

    const res = await request(app).post('/api/v1/enquiries').send(enquiry());

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('turnstileToken');
    expect(await Enquiry.countDocuments()).toBe(0);
  });

  it('checks the captcha before writing anything, not after', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    setCaptcha({ name: 'test', verify });

    await request(app).post('/api/v1/enquiries').send(enquiry());

    expect(verify).toHaveBeenCalledOnce();
    expect(await Enquiry.countDocuments()).toBe(0);
  });

  it('returns 400 for a summary too short to act on', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .send(enquiry({ summary: 'Help' }));

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('summary');
  });
});

describe('the honeypot', () => {
  it('answers a bot with a reference and stores nothing', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .send(enquiry({ website: 'https://spam.example.com' }));

    // Indistinguishable from success on purpose: a bot that learns it was
    // caught simply tries again without the field.
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^ENQ-[0-9A-HJ-NP-Z]{6}$/);

    expect(await Enquiry.countDocuments()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('does the same on the message form', async () => {
    const res = await request(app)
      .post('/api/v1/messages')
      .send(message({ website: 'anything' }));

    expect(res.status).toBe(201);
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe('what the firm is told', () => {
  it('sends the firm a notification carrying no personal data', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiry());
    const reference: string = res.body.data.reference;

    const notification = sent.find((mail) => mail.to === config.NOTIFY_ENQUIRIES_TO);
    expect(notification, `no notification among ${String(sent.length)} mails`).toBeDefined();

    const body = `${notification?.subject ?? ''} ${notification?.text ?? ''} ${notification?.html ?? ''}`;

    expect(body).toContain(reference);
    // The whole point: the firm reads the details in the dashboard, behind a
    // login, rather than in an inbox that may be forwarded or synced anywhere.
    expect(body).not.toContain('Adaeze');
    expect(body).not.toContain('adaeze.nwosu@example.com');
    expect(body).not.toContain('+2348030000000');
    expect(body).not.toContain('bond issuance');
  });

  it('acknowledges the submitter by first name, quoting the reference', async () => {
    const res = await request(app).post('/api/v1/enquiries').send(enquiry());

    const ack = sent.find((mail) => mail.to.includes('adaeze.nwosu@example.com'));
    expect(ack).toBeDefined();
    expect(ack?.text ?? '').toContain(res.body.data.reference);
    expect(ack?.text ?? '').toContain('Adaeze');
  });

  it('still accepts the submission when the mailer is down', async () => {
    setMailer({ name: 'broken', send: () => Promise.reject(new Error('SMTP unreachable')) });

    const res = await request(app).post('/api/v1/enquiries').send(enquiry());

    // Losing the enquiry would be far worse than losing the notification.
    expect(res.status).toBe(201);
    expect(await Enquiry.countDocuments()).toBe(1);
  });
});

describe('what is stored about the sender', () => {
  it('keeps a hashed IP, never the address itself', async () => {
    const res = await request(app)
      .post('/api/v1/enquiries')
      .set('X-Forwarded-For', '198.51.100.7')
      .send(enquiry());

    const stored = await Enquiry.findOne({ reference: res.body.data.reference }).lean();

    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain('198.51.100.7');
  });
});

describe('logging', () => {
  it('records the outcome without any of the personal data', async () => {
    const logs = captureLogs();

    const res = await request(app)
      .post('/api/v1/enquiries')
      .set('X-Forwarded-For', '198.51.100.7')
      .send(enquiry());

    const written = logs.release();

    expect(res.status).toBe(201);
    expect(written).not.toBe('');

    for (const secret of [
      'Adaeze',
      'adaeze.nwosu@example.com',
      '+2348030000000',
      'Meridian Capital',
      'bond issuance',
      '198.51.100.7',
    ]) {
      expect(written, `the log leaked ${secret}`).not.toContain(secret);
    }
  });
});

describe('submitting a message to the firm', () => {
  it('stores it and returns only a reference', async () => {
    const res = await request(app).post('/api/v1/messages').send(message());

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/messages');
    expect(res.body.data.reference).toMatch(/^MSG-[0-9A-HJ-NP-Z]{6}$/);

    expect(await Message.countDocuments()).toBe(1);
  });

  it('returns 400 for a message too short to be one', async () => {
    const res = await request(app)
      .post('/api/v1/messages')
      .send(message({ message: 'Hi' }));

    expect(res.status).toBe(400);
  });
});

describe('retention', () => {
  it('expires submissions through a TTL index rather than a manual sweep', async () => {
    const indexes = await Enquiry.collection.indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

    expect(ttl?.key).toEqual({ createdAt: 1 });
    expect(ttl?.expireAfterSeconds).toBeGreaterThan(0);
  });
});
