import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Job, Office, PracticeArea } from '../../../src/models/index.js';

/**
 * The four straightforward collections. Per ADR-029 each endpoint gets its
 * happy path with a contract assertion, one 400 and one 404; anything extra
 * here is logic genuinely unique to the endpoint, such as how a job stops
 * being public.
 */

setupTestDb();

const app = buildTestApp();

beforeEach(async () => {
  await runSeed();
});

describe('GET /api/v1/practice-areas', () => {
  it('returns every published area in the firm order', async () => {
    const res = await request(app).get('/api/v1/practice-areas');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/practice-areas');
    expect(res.body.data).toHaveLength(9);
    expect(res.body.data[0].title).toBe('Company Secretarial');
  });

  it('excludes drafts', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/practice-areas');

    expect(res.body.data).toHaveLength(8);
  });
});

describe('GET /api/v1/practice-areas/{slug}', () => {
  it('returns the detail with related insights', async () => {
    const res = await request(app).get('/api/v1/practice-areas/dispute-resolution-arbitration');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/practice-areas/{slug}');
    expect(res.body.data.relatedInsights.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await request(app).get('/api/v1/practice-areas/not-a-real-area');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/practice-areas/{slug}');
  });

  it('returns 400 for a slug that is not kebab-case', async () => {
    const res = await request(app).get('/api/v1/practice-areas/Not_A_Slug');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectToMatchContract(res, 'get', '/api/v1/practice-areas/{slug}');
  });
});

describe('GET /api/v1/offices', () => {
  it('returns offices in page order and matches the contract', async () => {
    const res = await request(app).get('/api/v1/offices');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/offices');
    expect(res.body.data.map((o: { name: string }) => o.name)).toEqual([
      'Lagos',
      'Abuja',
      'Ibadan',
    ]);
  });

  it('excludes drafts', async () => {
    await Office.updateOne({ slug: 'abuja' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/offices');

    expect(res.body.data).toHaveLength(2);
  });

  it('serves coordinates as { lat, lng } once the firm supplies them', async () => {
    await Office.updateOne(
      { slug: 'lagos' },
      { location: { type: 'Point', coordinates: [3.4064, 6.4541] } }
    );

    const res = await request(app).get('/api/v1/offices');
    const lagos = res.body.data.find((o: { name: string }) => o.name === 'Lagos');

    expect(lagos.coordinates).toEqual({ lng: 3.4064, lat: 6.4541 });
    expectToMatchContract(res, 'get', '/api/v1/offices');
  });
});

describe('GET /api/v1/faqs', () => {
  it('returns the FAQ set in order', async () => {
    const res = await request(app).get('/api/v1/faqs');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/faqs');
    expect(res.body.data).toHaveLength(5);
  });
});

describe('GET /api/v1/jobs', () => {
  it('returns open vacancies with their chips built', async () => {
    const res = await request(app).get('/api/v1/jobs');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/jobs');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].chips).toEqual([
      '2–4 years experience',
      'Full-time',
      'Hybrid',
      'Lagos',
    ]);
  });

  it('excludes a closed vacancy', async () => {
    await Job.updateOne({ slug: 'associate' }, { isOpen: false });

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data).toHaveLength(1);
  });

  it('excludes a vacancy past its closing date', async () => {
    await Job.updateOne({ slug: 'associate' }, { closingDate: new Date('2020-01-01') });

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data).toHaveLength(1);
  });

  it('keeps a vacancy whose closing date is still ahead', async () => {
    await Job.updateOne({ slug: 'associate' }, { closingDate: new Date('2099-01-01') });

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data).toHaveLength(2);
  });

  it('excludes drafts', async () => {
    await Job.updateOne({ slug: 'associate' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/jobs');

    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/v1/jobs/{id}', () => {
  it('returns one vacancy', async () => {
    const job = await Job.findOne({ slug: 'associate' }).lean();
    const res = await request(app).get(`/api/v1/jobs/${job?._id.toString() ?? ''}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/jobs/{id}');
    expect(res.body.data.title).toBe('Associate');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get(`/api/v1/jobs/${new Types.ObjectId().toString()}`);

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/jobs/{id}');
  });

  it('returns 400 for an id that is not an object id', async () => {
    const res = await request(app).get('/api/v1/jobs/not-an-id');

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'get', '/api/v1/jobs/{id}');
  });

  it('returns 404 rather than 200 for a closed vacancy, so a stale link cannot apply', async () => {
    const job = await Job.findOne({ slug: 'associate' }).lean();
    await Job.updateOne({ slug: 'associate' }, { isOpen: false });

    const res = await request(app).get(`/api/v1/jobs/${job?._id.toString() ?? ''}`);

    expect(res.status).toBe(404);
  });
});
