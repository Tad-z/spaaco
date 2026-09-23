import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Insight, Person } from '../../../src/models/index.js';

/**
 * The two endpoints with real behaviour to pin: filtering, sorting and
 * pagination. Everything beyond the happy path / 400 / 404 baseline here is a
 * rule from the designs that would otherwise be easy to break silently.
 */

setupTestDb();

const app = buildTestApp();

const names = (body: { data: { displayName: string }[] }): string[] =>
  body.data.map((person) => person.displayName);

beforeEach(async () => {
  await runSeed();
});

describe('GET /api/v1/people', () => {
  it('returns the directory with pagination meta', async () => {
    const res = await request(app).get('/api/v1/people');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/people');
    expect(res.body.meta).toEqual({ page: 1, pageSize: 9, total: 9, totalPages: 1 });
  });

  it('sorts by seniority by default: managing partner, partners, then the rest', async () => {
    const res = await request(app).get('/api/v1/people');

    expect(names(res.body)[0]).toBe('Dr. Babatunde Ajibade, SAN');
    expect(res.body.data.map((p: { role: string }) => p.role)).toEqual([
      'managing_partner',
      'partner',
      'partner',
      'associate_partner',
      'associate_partner',
      'associate_partner',
      'associate_partner',
      'senior_associate',
      'senior_associate',
    ]);
  });

  it('includes the managing partner in the Partners tab', async () => {
    const res = await request(app).get('/api/v1/people?role=partner');

    // Two partners plus the managing partner: the designs have no separate
    // Managing Partner tab, so filtering him out would hide him entirely.
    expect(res.body.data).toHaveLength(3);
    expect(names(res.body)).toContain('Dr. Babatunde Ajibade, SAN');
  });

  it('filters other roles exactly', async () => {
    const res = await request(app).get('/api/v1/people?role=senior_associate');

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  it('sorts by name in both directions', async () => {
    const ascending = await request(app).get('/api/v1/people?sort=name_asc');
    const descending = await request(app).get('/api/v1/people?sort=name_desc');

    expect(names(ascending.body)[0]).toBe('Dr. Babatunde Ajibade, SAN');
    expect(names(descending.body)[0]).toBe('Moruf Sowunmi');
  });

  it('paginates, and reports meta for the whole filtered set', async () => {
    const res = await request(app).get('/api/v1/people?page=2&pageSize=4');

    expect(res.body.data).toHaveLength(4);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 4, total: 9, totalPages: 3 });
    expectToMatchContract(res, 'get', '/api/v1/people');
  });

  it('returns an empty page with correct meta when the page is past the end', async () => {
    const res = await request(app).get('/api/v1/people?page=50');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(9);
  });

  it('returns 400 for a role outside the enum', async () => {
    const res = await request(app).get('/api/v1/people?role=intern');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectToMatchContract(res, 'get', '/api/v1/people');
  });

  it('returns 400 for a pageSize beyond the documented maximum', async () => {
    const res = await request(app).get('/api/v1/people?pageSize=500');

    expect(res.status).toBe(400);
  });

  it('excludes drafts', async () => {
    await Person.updateOne({ slug: 'david-essien' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/people');

    expect(res.body.meta.total).toBe(8);
  });
});

describe('GET /api/v1/people/{slug}', () => {
  it('returns the profile with practice areas, office and their insights', async () => {
    const res = await request(app).get('/api/v1/people/john-onyido');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/people/{slug}');
    expect(res.body.data.office.name).toBe('Lagos');
    expect(res.body.data.insights).toHaveLength(1);
  });

  it('returns 404 for an unknown attorney', async () => {
    const res = await request(app).get('/api/v1/people/nobody-here');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/people/{slug}');
  });
});

describe('GET /api/v1/insights', () => {
  it('returns cards newest first with pagination meta', async () => {
    const res = await request(app).get('/api/v1/insights');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/insights');
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data[0].publishedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('sorts oldest first when asked', async () => {
    const res = await request(app).get('/api/v1/insights?sort=oldest');

    expect(res.body.data[0].publishedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/v1/insights?category=regulatory_updates');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('filters by practice area slug', async () => {
    const res = await request(app).get('/api/v1/insights?practiceArea=energy-natural-resources');

    expect(res.body.data).toHaveLength(2);
  });

  it('returns an empty list, not a 404, for an unknown practice area filter', async () => {
    const res = await request(app).get('/api/v1/insights?practiceArea=not-a-real-area');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('gives a firm-authored insight the firm author block', async () => {
    const res = await request(app).get('/api/v1/insights?category=regulatory_updates');

    expect(res.body.data[0].author).toEqual({
      type: 'firm',
      name: 'SPA AJIBADE & Co.',
      label: 'Law Firm',
    });
  });

  it('gives an attorney-authored insight the person author block', async () => {
    const res = await request(app).get('/api/v1/insights?practiceArea=energy-natural-resources');
    const authors = res.body.data.map(
      (card: { author: { type: string; person?: { displayName: string } } }) =>
        card.author.person?.displayName
    );

    expect(authors).toContain('Dr. John Onyido');
    expect(authors).toContain('Peter Olalere');
  });

  it('gives a video insight the Watch Video call to action', async () => {
    const res = await request(app).get('/api/v1/insights?category=webinar_resources');

    expect(res.body.data[0].format).toBe('video');
    expect(res.body.data[0].cta).toEqual({ label: 'Watch Video', kind: 'watch_video' });
  });

  it('returns 400 for a category outside the enum', async () => {
    const res = await request(app).get('/api/v1/insights?category=gossip');

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'get', '/api/v1/insights');
  });

  it('excludes drafts', async () => {
    await Insight.updateOne({ slug: /trade-secrets$/ }, { status: 'draft' });

    const res = await request(app).get('/api/v1/insights');

    expect(res.body.meta.total).toBe(3);
  });
});

describe('GET /api/v1/insights/{slug}', () => {
  it('returns the detail with related insights', async () => {
    const insight = await Insight.findOne({ slug: /trade-secrets$/ }).lean();
    const res = await request(app).get(`/api/v1/insights/${insight?.slug ?? ''}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
    expect(res.body.data.related.length).toBeGreaterThan(0);
    expect(res.body.data.related.map((r: { slug: string }) => r.slug)).not.toContain(insight?.slug);
  });

  it('returns the video URL for a video insight', async () => {
    const insight = await Insight.findOne({ format: 'video' }).lean();
    const res = await request(app).get(`/api/v1/insights/${insight?.slug ?? ''}`);

    expect(res.body.data.videoUrl).toBeTruthy();
  });

  it('returns 404 for an unknown insight', async () => {
    const res = await request(app).get('/api/v1/insights/nothing-here');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
  });
});
