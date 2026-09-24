import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { expectToMatchContract } from '../../support/contract.js';
import { setupTestDb } from '../../support/setup-db.js';
import { AuditLog } from '../../../src/models/index.js';
import { config } from '../../../src/config/env.js';
import { signLocalUrl } from '../../../src/integrations/storage/private/local.driver.js';

/**
 * Redeeming a signed CV link.
 *
 * This is the only route in the API that serves a file to a caller with no
 * token, so it is worth being blunt about what it must refuse: a wrong
 * signature, an expired one, a signature for somebody else's file, and any key
 * that tries to leave the directory.
 */

setupTestDb();

const app = buildTestApp();

/** Supertest has no parser for octet-stream, so the bytes are collected here. */
const collect = (
  res: request.Response,
  callback: (error: Error | null, body: Buffer) => void
): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
};

const KEY = '11111111-2222-3333-4444-555555555555.pdf';
const CONTENTS = '%PDF-1.7 the applicant CV';

const link = (key: string, expiresInSeconds: number, signatureKey = key): string => {
  const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
  const signature = signLocalUrl(config.ENCRYPTION_KEY, signatureKey, expires);

  return `/api/v1/files/cv/${key}?expires=${expires}&signature=${signature}&filename=cv.pdf`;
};

beforeEach(async () => {
  const path = join(config.PRIVATE_UPLOAD_DIR, KEY);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, CONTENTS);
});

describe('a signed CV link', () => {
  it('serves the file to whoever holds a valid one', async () => {
    // Buffered: the response is octet-stream, which supertest will not decode
    // into `text` on its own.
    const res = await request(app).get(link(KEY, 300)).buffer(true).parse(collect);

    expect(res.status).toBe(200);
    // Not a JSON body, so the assertion checks the status is one the spec
    // declares rather than a schema — which is the whole contract this route
    // has, and more than it had when it was absent from the spec entirely.
    expectToMatchContract(res, 'get', '/api/v1/files/cv/{key}');
    expect(Buffer.from(res.body as Buffer).toString('utf8')).toBe(CONTENTS);
    expect(res.headers['content-disposition']).toContain('attachment');
    // Never cached: a CV must not sit in a proxy or a browser's disk cache.
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('audits the handover, not just the issue of the link', async () => {
    // A five-minute link can be forwarded and redeemed more than once, so
    // "who was given a link" and "when a CV was actually served" are
    // different facts, and only the second says one left the building.
    await request(app).get(link(KEY, 300)).buffer(true).parse(collect);

    const entry = await AuditLog.findOne({ action: 'application.cv.download' }).lean();

    expect(entry).toBeTruthy();
    // The key is the handle on the file, so only a digest of it is kept.
    expect(JSON.stringify(entry?.meta)).not.toContain(KEY);
  });

  it('refuses a tampered signature', async () => {
    // Flipped deterministically: replacing the first character with '0' is a
    // no-op one time in sixteen, and the test would pass a valid signature.
    const tampered = link(KEY, 300).replace(
      /signature=(.)/,
      (_match, first: string) => `signature=${first === '0' ? '1' : '0'}`
    );

    const res = await request(app).get(tampered);

    expect(res.status).toBe(403);
    expectToMatchContract(res, 'get', '/api/v1/files/cv/{key}');
  });

  it('refuses an expired one', async () => {
    const res = await request(app).get(link(KEY, -1));

    expect(res.status).toBe(403);
  });

  it('refuses a signature issued for a different file', async () => {
    // The signature covers the key, so one CV's link cannot fetch another's.
    const res = await request(app).get(link(KEY, 300, 'another-file.pdf'));

    expect(res.status).toBe(403);
  });

  it('refuses a key that is not one we issue', async () => {
    const expires = String(Math.floor(Date.now() / 1000) + 300);
    const traversal = encodeURIComponent('../../.env');

    const res = await request(app).get(
      `/api/v1/files/cv/${traversal}?expires=${expires}&signature=${'a'.repeat(64)}`
    );

    expect(res.status).toBe(400);
  });

  it('404s for a signature over a key that no longer exists', async () => {
    const res = await request(app).get(link('99999999-8888-7777-6666-555555555555.pdf', 300));

    expect(res.status).toBe(404);
  });
});
