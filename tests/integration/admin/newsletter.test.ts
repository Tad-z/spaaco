import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { AuditLog, NewsletterSubscriber } from '../../../src/models/index.js';

/**
 * The mailing list in the dashboard (ADR-067). Role enforcement lives in
 * roles.test.ts; this file is about what the list shows and what it records.
 */

setupTestDb();

const app = buildTestApp();

let token = '';
let firstId = '';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

const consent = { given: true as const, textVersion: '2026-10', at: new Date() };

beforeEach(async () => {
  token = (await createTestUser({ roles: ['business_dev'] })).token;

  const first = await NewsletterSubscriber.create({
    email: 'adaeze.nwosu@example.com',
    consent,
    ipHash: 'a'.repeat(64),
  });
  await NewsletterSubscriber.create({
    email: 'ibrahim.danladi@example.com',
    consent,
    ipHash: 'a'.repeat(64),
  });
  firstId = first._id.toString();
});

const get = (path: string): request.Test =>
  request(app).get(path).set('Authorization', `Bearer ${token}`);

const emails = (res: request.Response): string[] =>
  (res.body as { data: { email: string }[] }).data.map((row) => row.email);

describe('listing subscribers', () => {
  it('lists them newest first and audits the read', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/newsletter/subscribers');
    expect(emails(res)).toEqual(['ibrahim.danladi@example.com', 'adaeze.nwosu@example.com']);

    const audit = await AuditLog.findOne({ action: 'newsletter.list' }).lean();
    expect(audit?.meta).toMatchObject({ returned: 2, searched: false });
  });

  it('searches by part of an address', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers?q=NWOSU');

    expect(emails(res)).toEqual(['adaeze.nwosu@example.com']);
  });

  it('refuses an unknown query parameter', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers?status=pending');

    expect(res.status).toBe(400);
  });
});

describe('exporting the list', () => {
  it('downloads every address oldest first, and audits it', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers/export');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/newsletter/subscribers/export');
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"/
    );

    const lines = res.text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('email,subscribedAt');
    expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual([
      'adaeze.nwosu@example.com',
      'ibrahim.danladi@example.com',
    ]);

    const audit = await AuditLog.findOne({ action: 'newsletter.export' }).lean();
    expect(audit?.meta).toEqual({ rows: 2 });
  });
});

describe('erasing a subscriber', () => {
  it('deletes the record and audits it by id', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/newsletter/subscribers/${firstId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expectToMatchContract(res, 'delete', '/api/v1/admin/newsletter/subscribers/{id}');
    expect(await NewsletterSubscriber.findById(firstId)).toBeNull();

    const audit = await AuditLog.findOne({ action: 'newsletter.delete' }).lean();
    expect(audit?.entityId?.toString()).toBe(firstId);
  });

  it('refuses an id that is not one', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/newsletter/subscribers/nope')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('is a 404 for one that is not there', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/newsletter/subscribers/665f1a2b3c4d5e6f70819293')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'delete', '/api/v1/admin/newsletter/subscribers/{id}');
  });
});
