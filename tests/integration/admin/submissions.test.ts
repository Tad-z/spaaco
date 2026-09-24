import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import {
  Application,
  AuditLog,
  Enquiry,
  Job,
  Message,
  Office,
  PracticeArea,
} from '../../../src/models/index.js';
import { captureLogs } from '../../support/logs.js';

/**
 * Reading submissions in the dashboard.
 *
 * The separation here is the point: enquiries and messages belong to business
 * development, applications and CVs to HR, and neither can see the other's.
 * Every read of a single record is audit-logged, because these are the only
 * endpoints in the API that disclose a named person's details.
 */

setupTestDb();

const app = buildTestApp();

const tokens: Record<string, string> = {};

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

const consent = { given: true as const, textVersion: '2026-01', at: new Date() };

let enquiryId = '';
let messageId = '';
let applicationId = '';

beforeEach(async () => {
  await runSeed();

  for (const role of ['admin', 'business_dev', 'hr', 'editor'] as const) {
    tokens[role] = (await createTestUser({ roles: [role] })).token;
  }

  const [area, office, job] = await Promise.all([
    PracticeArea.findOne({ slug: 'tax' }).lean(),
    Office.findOne({ slug: 'lagos' }).lean(),
    Job.findOne({ status: 'published' }).lean(),
  ]);

  const enquiry = await Enquiry.create({
    reference: 'ENQ-AAA111',
    fullName: 'Adaeze Nwosu',
    email: 'adaeze.nwosu@example.com',
    phone: '+2348030000000',
    organization: 'Meridian Capital Partners',
    practiceArea: area?._id,
    preferredOffice: office?._id,
    summary: 'We are preparing a bond issuance and need counsel on the filing timetable.',
    consent,
    ipHash: 'a'.repeat(64),
  });
  enquiryId = enquiry._id.toString();

  const message = await Message.create({
    reference: 'MSG-BBB222',
    fullName: 'Ibrahim Danladi',
    email: 'ibrahim.danladi@example.com',
    subject: 'Question about an existing matter',
    message: 'Could someone confirm who is handling our trademark renewal?',
    consent,
    ipHash: 'b'.repeat(64),
  });
  messageId = message._id.toString();

  const application = await Application.create({
    reference: 'APP-CCC333',
    job: job?._id,
    fullName: 'Temitope Bakare',
    email: 'temitope.bakare@example.com',
    phone: '+2348050000000',
    coverNote: 'I am completing my third year in corporate practice.',
    cv: {
      storageKey: 'cv/11111111-2222-3333-4444-555555555555.pdf',
      originalName: 'temitope-bakare-cv.pdf',
      mimeType: 'application/pdf',
      bytes: 184_320,
      scanStatus: 'clean',
    },
    consent,
    ipHash: 'c'.repeat(64),
  });
  applicationId = application._id.toString();
});

const as = (role: string): string => `Bearer ${tokens[role] ?? ''}`;

describe('enquiries', () => {
  it('lists them for business development', async () => {
    const res = await request(app)
      .get('/api/v1/admin/enquiries')
      .set('Authorization', as('business_dev'));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/enquiries');

    expect(res.body.data[0].reference).toBe('ENQ-AAA111');
    expect(res.body.meta.total).toBe(1);
  });

  it('never returns the ipHash or the user agent', async () => {
    const res = await request(app).get('/api/v1/admin/enquiries').set('Authorization', as('admin'));

    // Kept for abuse investigation, of no use to a person reading the enquiry.
    expect(JSON.stringify(res.body)).not.toContain('aaaaaaaa');
    expect(res.body.data[0].ipHash).toBeUndefined();
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/enquiries?status=closed')
      .set('Authorization', as('admin'));

    expect(res.body.meta.total).toBe(0);
  });

  it('shows one, with the practice area and office resolved', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/enquiries/{id}');

    expect(res.body.data.practiceArea.slug).toBe('tax');
    expect(res.body.data.preferredOffice.name).toBe('Lagos');
    expect(res.body.data.consent.textVersion).toBe('2026-01');
  });

  it('returns 404 for one that is not there', async () => {
    const res = await request(app)
      .get('/api/v1/admin/enquiries/665f1a2b3c4d5e6f70819293')
      .set('Authorization', as('admin'));

    expect(res.status).toBe(404);
  });

  it('records an audit entry for reading one, but not for the list', async () => {
    await request(app).get('/api/v1/admin/enquiries').set('Authorization', as('admin'));
    expect(await AuditLog.countDocuments({ action: /enquiry/ })).toBe(0);

    await request(app)
      .get(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'));

    const entry = await AuditLog.findOne({ action: 'enquiry.view' }).lean();
    expect(entry?.entityId?.toString()).toBe(enquiryId);
    expect(entry?.actor).toBeTruthy();
    // The trail says who read which record, never what it said.
    expect(JSON.stringify(entry?.meta)).not.toContain('Adaeze');
  });

  it('updates the status and who is handling it', async () => {
    const assignee = await createTestUser({ roles: ['business_dev'], email: 'bd@spaajibade.test' });

    const res = await request(app)
      .patch(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'))
      .send({ status: 'in_review', assignedTo: assignee.user._id.toString() });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/enquiries/{id}');

    expect(res.body.data.status).toBe('in_review');
    expect(res.body.data.assignedTo.id).toBe(assignee.user._id.toString());
  });

  it('refuses to edit anything the submitter wrote', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'))
      .send({ summary: 'Rewritten by the firm.' });

    // A submission is a record of what was sent, not a working document.
    expect(res.status).toBe(400);
  });

  it('refuses an empty patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('messages', () => {
  it('lists them for business development', async () => {
    const res = await request(app)
      .get('/api/v1/admin/messages')
      .set('Authorization', as('business_dev'));

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/messages');
    expect(res.body.data[0].reference).toBe('MSG-BBB222');
  });

  it('shows one and audits the read', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/messages/${messageId}`)
      .set('Authorization', as('admin'));

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/messages/{id}');
    expect(await AuditLog.countDocuments({ action: 'message.view' })).toBe(1);
  });

  it('updates the status', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/messages/${messageId}`)
      .set('Authorization', as('admin'))
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/messages/{id}');
  });
});

describe('applications', () => {
  it('lists them for HR', async () => {
    const res = await request(app).get('/api/v1/admin/applications').set('Authorization', as('hr'));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/applications');

    expect(res.body.data[0].reference).toBe('APP-CCC333');
    expect(res.body.data[0].job.title).toBeTruthy();
  });

  it('never returns the CV storage key, which is the only way to the file', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}`)
      .set('Authorization', as('hr'));

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/applications/{id}');

    expect(JSON.stringify(res.body)).not.toContain('11111111-2222');
    expect(res.body.data.cv).toEqual({
      originalName: 'temitope-bakare-cv.pdf',
      mimeType: 'application/pdf',
      bytes: 184_320,
      scanStatus: 'clean',
    });
  });

  it('filters by vacancy', async () => {
    const other = await Job.findOne({ slug: { $exists: true } })
      .sort({ _id: -1 })
      .lean();

    const res = await request(app)
      .get(`/api/v1/admin/applications?job=${other?._id.toString() ?? ''}`)
      .set('Authorization', as('hr'));

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeLessThanOrEqual(1);
  });

  it('moves one through the hiring stages', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/applications/${applicationId}`)
      .set('Authorization', as('hr'))
      .send({ status: 'shortlisted' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/applications/{id}');
    expect(res.body.data.status).toBe('shortlisted');
  });

  it('survives its vacancy being deleted', async () => {
    await Job.deleteMany({});

    const res = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}`)
      .set('Authorization', as('hr'));

    // Losing the application would be worse than showing it without its job.
    expect(res.status).toBe(200);
    expect(res.body.data.job).toBeNull();
  });
});

describe('the CV link', () => {
  it('is short-lived, and every issue is audited', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}/cv`)
      .set('Authorization', as('hr'));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/applications/{id}/cv');

    const expiresIn = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);

    expect(res.body.data.filename).toBe('temitope-bakare-cv.pdf');

    const entry = await AuditLog.findOne({ action: 'application.cv.view' }).lean();
    expect(entry?.entityId?.toString()).toBe(applicationId);
    expect(entry?.actor).toBeTruthy();
  });

  it('refuses a CV that has not passed the scan', async () => {
    await Application.updateOne({ _id: applicationId }, { 'cv.scanStatus': 'pending' });

    const res = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}/cv`)
      .set('Authorization', as('hr'));

    expect(res.status).toBe(409);
    expect(await AuditLog.countDocuments({ action: 'application.cv.view' })).toBe(0);
  });

  it('refuses an infected one outright', async () => {
    await Application.updateOne({ _id: applicationId }, { 'cv.scanStatus': 'infected' });

    const res = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}/cv`)
      .set('Authorization', as('hr'));

    expect(res.status).toBe(409);
  });
});

describe('who can see what', () => {
  it('keeps editors out of every submission', async () => {
    for (const path of ['enquiries', 'messages', 'applications']) {
      const res = await request(app)
        .get(`/api/v1/admin/${path}`)
        .set('Authorization', as('editor'));

      expect(res.status, path).toBe(403);
    }
  });

  it('keeps business development out of applications and CVs', async () => {
    const list = await request(app)
      .get('/api/v1/admin/applications')
      .set('Authorization', as('business_dev'));
    expect(list.status).toBe(403);

    const cv = await request(app)
      .get(`/api/v1/admin/applications/${applicationId}/cv`)
      .set('Authorization', as('business_dev'));
    expect(cv.status).toBe(403);
  });

  it('keeps HR out of enquiries and messages', async () => {
    for (const path of ['enquiries', 'messages']) {
      const res = await request(app).get(`/api/v1/admin/${path}`).set('Authorization', as('hr'));

      expect(res.status, path).toBe(403);
    }
  });

  it('writes no audit entry for a read that was refused', async () => {
    await request(app)
      .get(`/api/v1/admin/applications/${applicationId}`)
      .set('Authorization', as('editor'));

    expect(await AuditLog.countDocuments({ action: 'application.view' })).toBe(0);
  });
});

describe('logging', () => {
  it('keeps personal data out of the log while reading a submission', async () => {
    const logs = captureLogs();

    await request(app)
      .get(`/api/v1/admin/enquiries/${enquiryId}`)
      .set('Authorization', as('admin'));

    const written = logs.release();

    for (const secret of ['Adaeze', 'adaeze.nwosu@example.com', 'bond issuance']) {
      expect(written, `the log leaked ${secret}`).not.toContain(secret);
    }
  });
});
