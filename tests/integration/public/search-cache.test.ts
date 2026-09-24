import mongoose from 'mongoose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Insight } from '../../../src/models/index.js';
import { previewToken } from '../../support/auth.js';
import * as cache from '../../../src/core/cache.js';
import { invalidateEntity } from '../../../src/services/cache.service.js';
import * as siteService from '../../../src/services/site.service.js';

/**
 * Search and caching.
 *
 * Both are easy to write in a way that looks right and does nothing, so the
 * assertions here are about observable consequences: that ranking actually
 * orders results, that a second request really avoids the database, and that
 * an invalidation really drops the entry.
 */

setupTestDb();

const app = buildTestApp();

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();
  // setupTestDb clears the cache after each test; seeding here can populate it
  // again through the models, so start each test from empty.
  cache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/search', () => {
  it('returns grouped results and matches the contract', async () => {
    const res = await request(app).get('/api/v1/search?q=arbitration');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/search');
    expect(res.body.data.practiceAreas.length).toBeGreaterThan(0);
  });

  it('searches across all three collections', async () => {
    const res = await request(app).get('/api/v1/search?q=energy');

    expect(res.body.data.practiceAreas.length).toBeGreaterThan(0);
    expect(res.body.data.insights.length).toBeGreaterThan(0);
  });

  it('finds an attorney by name', async () => {
    const res = await request(app).get('/api/v1/search?q=Ajibade');

    expect(res.body.data.people.map((p: { slug: string }) => p.slug)).toContain(
      'babatunde-ajibade'
    );
  });

  it('ranks a title match above a passing mention', async () => {
    const res = await request(app).get('/api/v1/search?q=electrification');

    // The Rural Electrification article has it in the title; the Energy
    // practice area only mentions it in its summary.
    expect(res.body.data.insights[0].title).toContain('Rural Electrification');
  });

  it('caps each group at five results', async () => {
    const res = await request(app).get('/api/v1/search?q=the');

    expect(res.body.data.practiceAreas.length).toBeLessThanOrEqual(5);
    expect(res.body.data.insights.length).toBeLessThanOrEqual(5);
  });

  it('returns 400 for a query shorter than two characters', async () => {
    const res = await request(app).get('/api/v1/search?q=a');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectToMatchContract(res, 'get', '/api/v1/search');
  });

  it('returns 400 when the query is missing entirely', async () => {
    const res = await request(app).get('/api/v1/search');

    expect(res.status).toBe(400);
  });

  it('returns empty groups rather than an error when nothing matches', async () => {
    const res = await request(app).get('/api/v1/search?q=zzzzqqqq');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ practiceAreas: [], people: [], insights: [] });
  });

  it('never returns drafts, even to an authenticated admin asking for preview', async () => {
    await Insight.updateMany({}, { status: 'draft' });

    const res = await request(app)
      .get('/api/v1/search?q=energy&preview=true')
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(res.body.data.insights).toEqual([]);
  });
});

describe('caching', () => {
  it('serves a second request from the cache instead of the database', async () => {
    const spy = vi.spyOn(siteService, 'getSite');

    await request(app).get('/api/v1/site');
    await request(app).get('/api/v1/site');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches each page under its own key', async () => {
    await request(app).get('/api/v1/pages/home');
    await request(app).get('/api/v1/pages/about');

    expect(cache.size()).toBe(2);
  });

  it('drops the entry when its tag is invalidated', async () => {
    await request(app).get('/api/v1/site');
    expect(cache.size()).toBe(1);

    invalidateEntity('faq');

    expect(cache.size()).toBe(0);
  });

  it('invalidates every surface a practice area appears on', async () => {
    await request(app).get('/api/v1/site');
    await request(app).get('/api/v1/pages/home');
    await request(app).get('/api/v1/pages/practice-areas');
    await request(app).get('/api/v1/pages/careers');
    await request(app).get('/api/v1/pages/offices');
    expect(cache.size()).toBe(5);

    invalidateEntity('practiceArea', 'tax');

    // Careers goes too: job cards carry a practice area. Offices survives,
    // because nothing on it shows one.
    expect(cache.size()).toBe(1);
  });

  it('invalidates the careers page when an office changes, since job chips show it', async () => {
    await request(app).get('/api/v1/pages/careers');
    await request(app).get('/api/v1/pages/insights');
    expect(cache.size()).toBe(2);

    invalidateEntity('office');

    expect(cache.size()).toBe(1);
  });

  it('invalidates the insights page when an attorney changes, since cards show the author', async () => {
    await request(app).get('/api/v1/pages/insights');

    invalidateEntity('person', 'john-onyido');

    expect(cache.size()).toBe(0);
  });

  it('bypasses the cache for preview, so a draft cannot be served to the next visitor', async () => {
    await Insight.updateMany({}, { status: 'draft' });

    await request(app)
      .get('/api/v1/pages/home?preview=true')
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(cache.size()).toBe(0);

    const publicRes = await request(app).get('/api/v1/pages/home');
    expect(publicRes.body.data.latestInsights).toHaveLength(0);
  });
});

describe('cache headers', () => {
  it('sends Cache-Control and an ETag on a public read', async () => {
    const res = await request(app).get('/api/v1/site');

    expect(res.headers['cache-control']).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
    );
    expect(res.headers.etag).toMatch(/^W\//);
  });

  it('answers 304 for a matching If-None-Match', async () => {
    const first = await request(app).get('/api/v1/site');

    const second = await request(app)
      .get('/api/v1/site')
      .set('If-None-Match', String(first.headers.etag));

    expect(second.status).toBe(304);
    expect(second.text).toBeFalsy();
  });

  it('answers 200 when the ETag no longer matches', async () => {
    const res = await request(app).get('/api/v1/site').set('If-None-Match', 'W/"stale"');

    expect(res.status).toBe(200);
  });

  it('never caches a preview response', async () => {
    const res = await request(app)
      .get('/api/v1/site?preview=true')
      .set('Authorization', `Bearer ${await previewToken()}`);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.etag).toBeUndefined();
  });

  it('never caches an error, which may become a 200 a minute later', async () => {
    const res = await request(app).get('/api/v1/people/nobody-here');

    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
