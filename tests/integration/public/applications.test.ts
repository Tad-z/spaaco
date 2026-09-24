import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Application, Job } from '../../../src/models/index.js';
import { setMailer } from '../../../src/services/notify.service.js';
import { setCaptcha } from '../../../src/services/captcha.service.js';
import { setVirusScanner } from '../../../src/services/virus-scan.service.js';
import { privateStorage } from '../../../src/integrations/storage/private/index.js';
import { captureLogs } from '../../support/logs.js';
import type { SentMail } from '../../../src/interfaces/integrations/mailer.interface.js';

/**
 * Job applications: the one public endpoint that accepts a file.
 *
 * A CV is the most sensitive thing this API receives, and the upload path is
 * the only place an outsider can put bytes on the firm's storage. So the tests
 * are about what is refused — the wrong type, an infected file, a vacancy that
 * is closed — and about nothing being stored when any of those happen.
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
  setVirusScanner({ name: 'test', scan: () => Promise.resolve('clean') });
});

/** A minimal but genuine PDF, so the magic-byte check is really exercised. */
const pdf = (): Buffer =>
  Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
    Buffer.from('%%EOF\n'),
  ]);

/**
 * A DOCX is a ZIP whose central directory names `word/document.xml`. This is
 * the smallest thing that is honestly one.
 */
const docx = (): Buffer =>
  Buffer.concat([
    Buffer.from('PK\x03\x04', 'latin1'),
    Buffer.alloc(26),
    Buffer.from('word/document.xml', 'latin1'),
    Buffer.from('PK\x05\x06', 'latin1'),
    Buffer.alloc(18),
  ]);

const openJobId = async (): Promise<string> => {
  const job = await Job.findOne({ status: 'published', isOpen: true }).lean();
  return job?._id.toString() ?? '';
};

const apply = async (
  jobId: string,
  overrides: {
    file?: Buffer | null;
    name?: string;
    type?: string;
    fields?: Record<string, string>;
  } = {}
): Promise<request.Response> => {
  const req = request(app).post(`/api/v1/jobs/${jobId}/applications`);

  const fields: Record<string, string> = {
    fullName: 'Temitope Bakare',
    email: 'temitope.bakare@example.com',
    phone: '+2348050000000',
    coverNote: 'I am completing my third year in corporate practice.',
    consent: 'true',
    consentTextVersion: '2026-01',
    turnstileToken: 'test',
    ...overrides.fields,
  };

  for (const [key, value] of Object.entries(fields)) req.field(key, value);

  if (overrides.file !== null) {
    req.attach('cv', overrides.file ?? pdf(), {
      filename: overrides.name ?? 'temitope-bakare-cv.pdf',
      contentType: overrides.type ?? 'application/pdf',
    });
  }

  return req;
};

describe('applying for a vacancy', () => {
  it('stores the application and returns only a reference', async () => {
    const res = await apply(await openJobId());

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/jobs/{id}/applications');

    expect(res.body.data.reference).toMatch(/^APP-[0-9A-HJ-NP-Z]{6}$/);

    const stored = await Application.findOne({ reference: res.body.data.reference }).lean();
    expect(stored?.fullName).toBe('Temitope Bakare');
    expect(stored?.cv.scanStatus).toBe('clean');
    expect(stored?.cv.originalName).toBe('temitope-bakare-cv.pdf');
    expect(stored?.status).toBe('new');
  });

  it('stores the CV under a random key, never the name it arrived with', async () => {
    const res = await apply(await openJobId());
    const stored = await Application.findOne({ reference: res.body.data.reference }).lean();

    // A predictable key would let somebody guess at another applicant's file.
    expect(stored?.cv.storageKey).not.toContain('temitope');
    expect(stored?.cv.storageKey).toMatch(/[0-9a-f-]{16,}/);
  });

  it('accepts a DOCX as well as a PDF', async () => {
    const res = await apply(await openJobId(), {
      file: docx(),
      name: 'cv.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('returns 404 for a vacancy that does not exist', async () => {
    const res = await apply('665f1a2b3c4d5e6f70819293');

    expect(res.status).toBe(404);
    expect(await Application.countDocuments()).toBe(0);
  });

  it('refuses an application to a closed vacancy', async () => {
    const id = await openJobId();
    await Job.updateOne({ _id: id }, { isOpen: false });

    const res = await apply(id);

    expect(res.status).toBe(404);
    expect(await Application.countDocuments()).toBe(0);
  });

  it('refuses an application to an unpublished vacancy', async () => {
    const id = await openJobId();
    await Job.updateOne({ _id: id }, { status: 'draft' });

    const res = await apply(id);

    expect(res.status).toBe(404);
  });
});

describe('what may be uploaded', () => {
  it('refuses an executable renamed to .pdf', async () => {
    const res = await apply(await openJobId(), {
      file: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048)]),
      name: 'cv.pdf',
    });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(await Application.countDocuments()).toBe(0);
  });

  it('refuses a ZIP that is not a DOCX', async () => {
    // A real ZIP, but with no word/document.xml in it.
    const zip = Buffer.concat([
      Buffer.from('PK\x03\x04', 'latin1'),
      Buffer.alloc(26),
      Buffer.from('holiday-photos.jpg', 'latin1'),
    ]);

    const res = await apply(await openJobId(), { file: zip, name: 'cv.docx' });

    expect(res.status).toBe(415);
  });

  it('refuses an image, however it is labelled', async () => {
    const res = await apply(await openJobId(), {
      file: Buffer.from('89504e470d0a1a0a', 'hex'),
      name: 'cv.pdf',
      type: 'application/pdf',
    });

    expect(res.status).toBe(415);
  });

  it('requires a file at all', async () => {
    const res = await apply(await openJobId(), { file: null });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('cv');
  });
});

describe('the virus scan', () => {
  it('refuses an infected file with 422 and stores nothing', async () => {
    setVirusScanner({ name: 'test', scan: () => Promise.resolve('infected') });

    const res = await apply(await openJobId());

    // 422, not 400: the fields were fine, the file was not (ADR-026).
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_REJECTED');
    expect(await Application.countDocuments()).toBe(0);
  });

  it('scans before storing, so an infected file never reaches storage', async () => {
    const scan = vi.fn().mockResolvedValue('infected');
    setVirusScanner({ name: 'test', scan });
    const put = vi.spyOn(privateStorage(), 'put');

    await apply(await openJobId());

    expect(scan).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });
});

describe('the honeypot and the emails', () => {
  it('answers a bot with a reference and stores nothing', async () => {
    const res = await apply(await openJobId(), { fields: { website: 'https://spam.example' } });

    expect(res.status).toBe(201);
    expect(await Application.countDocuments()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('tells HR only the reference, and acknowledges the applicant', async () => {
    const res = await apply(await openJobId());
    const reference: string = res.body.data.reference;

    const notification = sent.find((mail) => !mail.to.includes('temitope'));
    const body = `${notification?.subject ?? ''} ${notification?.text ?? ''}`;

    expect(body).toContain(reference);
    expect(body).not.toContain('Temitope');
    expect(body).not.toContain('temitope.bakare@example.com');

    const ack = sent.find((mail) => mail.to === 'temitope.bakare@example.com');
    expect(ack?.text).toContain(reference);
  });
});

describe('logging', () => {
  it('records the outcome without the applicant or the file name', async () => {
    const logs = captureLogs();

    await apply(await openJobId());

    const written = logs.release();

    for (const secret of [
      'Temitope',
      'temitope.bakare@example.com',
      '+2348050000000',
      'temitope-bakare-cv.pdf',
      'third year in corporate practice',
    ]) {
      expect(written, `the log leaked ${secret}`).not.toContain(secret);
    }
  });
});

describe('retention', () => {
  it('expires applications through a TTL index', async () => {
    const indexes = await Application.collection.indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

    expect(ttl?.key).toEqual({ createdAt: 1 });
    expect(ttl?.expireAfterSeconds).toBeGreaterThan(0);
  });
});
