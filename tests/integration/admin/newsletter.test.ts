import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { AuditLog, NewsletterSubscriber } from '../../../src/models/index.js';

/**
 * The mailing list in the dashboard (ADR-065). Role enforcement lives in
 * roles.test.ts; this file is about what the list shows and what it records.
 */

setupTestDb();

const app = buildTestApp();

let token = '';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

const consent = { given: true as const, textVersion: '2026-10', at: new Date() };
const UNSUBSCRIBE_TOKEN = 'Vb7nC0x9mQ2rT4yU6iO8pA1sD3fG5hJ7kL9zX2cV4bN';

let subscribedId = '';

beforeEach(async () => {
  token = (await createTestUser({ roles: ['business_dev'] })).token;

  const [subscribed] = await NewsletterSubscriber.create([
    {
      email: 'adaeze.nwosu@example.com',
      status: 'subscribed',
      consent,
      unsubscribeToken: UNSUBSCRIBE_TOKEN,
      subscribedAt: new Date('2026-10-01T09:30:00.000Z'),
      ipHash: 'a'.repeat(64),
    },
    {
      email: 'ibrahim.danladi@example.com',
      status: 'pending',
      consent,
      confirmTokenHash: 'b'.repeat(64),
      unsubscribeToken: 'x'.repeat(43),
      expiresAt: new Date(Date.now() + 86_400_000),
      ipHash: 'a'.repeat(64),
    },
  ]);
  subscribedId = subscribed?._id.toString() ?? '';
});

const get = (path: string): request.Test =>
  request(app).get(path).set('Authorization', `Bearer ${token}`);

describe('listing subscribers', () => {
  it('lists every address with its status, without tokens, and audits the read', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/newsletter/subscribers');
    expect(res.body.meta.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain(UNSUBSCRIBE_TOKEN);

    const audit = await AuditLog.findOne({ action: 'newsletter.list' }).lean();
    expect(audit?.meta).toMatchObject({ returned: 2, searched: false });
  });

  it('filters by status and by part of an address', async () => {
    const pending = await get('/api/v1/admin/newsletter/subscribers?status=pending');
    expect(pending.body.data.map((row: { email: string }) => row.email)).toEqual([
      'ibrahim.danladi@example.com',
    ]);

    const searched = await get('/api/v1/admin/newsletter/subscribers?q=NWOSU');
    expect(searched.body.data.map((row: { email: string }) => row.email)).toEqual([
      'adaeze.nwosu@example.com',
    ]);
  });

  it('refuses an unknown status', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers?status=bounced');

    expect(res.status).toBe(400);
  });
});

describe('exporting the list', () => {
  it('downloads confirmed subscribers only, with their unsubscribe links, and audits it', async () => {
    const res = await get('/api/v1/admin/newsletter/subscribers/export');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/newsletter/subscribers/export');
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"/
    );
    expect(res.text).toBe(
      'email,subscribedAt,unsubscribeUrl\r\n' +
        'adaeze.nwosu@example.com,2026-10-01T09:30:00.000Z,' +
        `http://localhost:3000/newsletter/unsubscribe?token=${UNSUBSCRIBE_TOKEN}\r\n`
    );

    const audit = await AuditLog.findOne({ action: 'newsletter.export' }).lean();
    expect(audit?.meta).toEqual({ rows: 1 });
  });
});

describe('erasing a subscriber', () => {
  it('deletes the record and audits it by id', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/newsletter/subscribers/${subscribedId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expectToMatchContract(res, 'delete', '/api/v1/admin/newsletter/subscribers/{id}');
    expect(await NewsletterSubscriber.findById(subscribedId)).toBeNull();

    const audit = await AuditLog.findOne({ action: 'newsletter.delete' }).lean();
    expect(audit?.entityId?.toString()).toBe(subscribedId);
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
