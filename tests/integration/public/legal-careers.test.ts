import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { normalise, readFixture } from '../../support/fixtures.js';
import { previewToken } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { Job, LegalPage } from '../../../src/models/index.js';

/** Legal pages (ADR-057) and the careers empty state. */

setupTestDb();

const app = buildTestApp();

beforeEach(async () => {
  await runSeed();
});

describe('GET /api/v1/legal/{key}', () => {
  it('serves the Terms of Service', async () => {
    const res = await request(app).get('/api/v1/legal/terms');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/legal/{key}');
    const { updatedAt, ...rest } = res.body.data as Record<string, unknown>;
    const { updatedAt: _fixed, ...expected } = (
      readFixture('legal.detail.terms.json') as { data: Record<string, unknown> }
    ).data;
    expect(normalise(rest)).toEqual(normalise(expected));
    expect(updatedAt).toBeTypeOf('string');
  });

  it('returns 404 for a key that names no legal page', async () => {
    const res = await request(app).get('/api/v1/legal/cookies');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/legal/{key}');
  });

  it('returns 400 for a malformed key', async () => {
    const res = await request(app).get('/api/v1/legal/Terms_Of_Service');

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'get', '/api/v1/legal/{key}');
  });

  it('hides a draft legal page, except from a valid preview token', async () => {
    await LegalPage.updateOne({ key: 'privacy' }, { status: 'draft' });

    const anonymous = await request(app).get('/api/v1/legal/privacy');
    const preview = await request(app)
      .get('/api/v1/legal/privacy?preview=true')
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(anonymous.status).toBe(404);
    expect(preview.status).toBe(200);
  });
});

describe('the careers empty state', () => {
  it('is withheld while any job is open', async () => {
    const res = await request(app).get('/api/v1/pages/careers');

    expect(res.body.data.jobs).toHaveLength(2);
    expect(res.body.data.jobsSection.emptyState).toBeNull();
  });

  it('is served when no job is open', async () => {
    await Job.updateMany({}, { isOpen: false });

    const res = await request(app).get('/api/v1/pages/careers');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/pages/{key}');
    expect(res.body.data.jobs).toEqual([]);
    expect(res.body.data.jobsSection.emptyState).toEqual({
      title: 'No Open Roles at the Moment',
      body: expect.stringContaining('<a href="mailto:hr@spaajibade.com">') as unknown,
      ctaLabel: 'Send your CV',
    });
  });
});
