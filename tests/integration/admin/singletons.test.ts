import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import * as cache from '../../../src/core/cache.js';
import { PAGE_KEYS } from '../../../src/constants/enums.js';

/**
 * The admin singletons: the eight page documents and site settings.
 *
 * They share one implementation, because the hard part is identical for all
 * nine — merge a section, validate the *result*, and save it only if nobody
 * else saved first. What differs is only which schema the merged document must
 * satisfy, so that is what the tests vary.
 */

setupTestDb();

const app = buildTestApp();

let token = '';

const auth = (): string => `Bearer ${token}`;

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();
  token = (await createTestUser({ roles: ['admin'] })).token;
});

/** The editable body: what a GET returns, minus the fields the server owns. */
const editable = (body: Record<string, unknown>): Record<string, unknown> => {
  const { id, key, revision, createdAt, updatedAt, _expanded, ...rest } = body;
  return rest;
};

const getPage = async (
  key: string
): Promise<{ body: Record<string, unknown>; revision: number }> => {
  const res = await request(app).get(`/api/v1/admin/pages/${key}`).set('Authorization', auth());

  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { body: res.body.data, revision: res.body.data.revision };
};

describe('reading a page', () => {
  it('returns the editable shape with references as ids', async () => {
    const res = await request(app).get('/api/v1/admin/pages/home').set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/pages/{key}');

    expect(res.body.data.key).toBe('home');
    expect(res.body.data.revision).toBeTypeOf('number');
    // A composed public payload would have Image objects here; the editable
    // shape keeps the carousel as ids, each previewed in `_expanded`.
    const slides = res.body.data.hero.images as string[];
    expect(slides).toHaveLength(3);
    for (const id of slides) {
      expect(id).toBeTypeOf('string');
      expect(res.body.data._expanded[id]).toMatchObject({ kind: 'media' });
    }
  });

  it('returns 400 for a key that is not a page', async () => {
    const res = await request(app).get('/api/v1/admin/pages/nope').set('Authorization', auth());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('replacing a page', () => {
  it.each(PAGE_KEYS.values)('round-trips GET then PUT for %s', async (key) => {
    const { body, revision } = await getPage(key);

    const res = await request(app)
      .put(`/api/v1/admin/pages/${key}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send(editable(body));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'put', '/api/v1/admin/pages/{key}');

    // The point of the round-trip: nothing changed except the revision.
    expect(editable(res.body.data)).toEqual(editable(body));
    expect(res.body.data.revision).toBe(revision + 1);
  });

  it('rejects a body missing a section the page needs', async () => {
    const { body, revision } = await getPage('home');
    const { hero, ...withoutHero } = editable(body);

    const res = await request(app)
      .put('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send(withoutHero);

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('hero');
  });

  it('refuses a write with no If-Match rather than taking last write wins', async () => {
    const { body } = await getPage('home');

    const res = await request(app)
      .put('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .send(editable(body));

    // 428: the precondition is missing, not the body malformed.
    expect(res.status).toBe(428);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('If-Match');
  });
});

describe('patching a page section', () => {
  it('leaves every other section byte-identical', async () => {
    const before = await getPage('home');
    const untouched = { ...editable(before.body) };
    delete untouched.hero;

    const res = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(before.revision))
      .send({ hero: { ...(before.body.hero as object), title: 'A new headline' } });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/pages/{key}');

    const after = editable(res.body.data);
    const changed = after.hero as { title: string };
    delete after.hero;

    expect(changed.title).toBe('A new headline');
    expect(after).toEqual(untouched);
  });

  it('replaces an array inside a section whole rather than merging it', async () => {
    const before = await getPage('about');
    const stats = before.body.stats as { items: unknown[] } | undefined;

    expect(stats?.items.length, 'the About page seed should have stats').toBeGreaterThan(1);

    const res = await request(app)
      .patch('/api/v1/admin/pages/about')
      .set('Authorization', auth())
      .set('If-Match', String(before.revision))
      .send({ stats: { ...stats, items: [stats?.items[0]] } });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body.data.stats as { items: unknown[] }).items).toHaveLength(1);
  });

  it('returns 400 naming the section when the merged result is invalid', async () => {
    const { revision } = await getPage('home');

    const res = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ hero: { title: '' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths.some((path: string) => path.startsWith('hero'))).toBe(true);
  });

  it('rejects a section the page does not have, instead of storing it', async () => {
    const { revision } = await getPage('home');

    const res = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ hreo: { title: 'Typo' } });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('hreo');
  });

  it('rejects an empty patch, which can only be a client bug', async () => {
    const { revision } = await getPage('home');

    const res = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 409 with the current revision when someone else saved first', async () => {
    const { body, revision } = await getPage('home');

    const first = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ hero: { ...(body.hero as object), title: 'First' } });

    expect(first.status).toBe(200);

    const second = await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ hero: { ...(body.hero as object), title: 'Second' } });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(second.body.error.details)).toContain(String(revision + 1));
  });

  it('clears the caches the page appears on', async () => {
    const { body, revision } = await getPage('home');

    await request(app).get('/api/v1/pages/home');
    expect(cache.size()).toBeGreaterThan(0);

    await request(app)
      .patch('/api/v1/admin/pages/home')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ hero: { ...(body.hero as object), title: 'Fresh' } });

    const res = await request(app).get('/api/v1/pages/home');
    expect(res.body.data.hero.title).toBe('Fresh');
  });
});

describe('settings', () => {
  const getSettings = async (): Promise<{ body: Record<string, unknown>; revision: number }> => {
    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', auth());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { body: res.body.data, revision: res.body.data.revision };
  };

  it('returns the editable shape', async () => {
    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/settings');
    expect(res.body.data.firmName).toBe('SPA Ajibade & Co.');
  });

  it('drops the newsletter switch that settings saved before ADR-066 still hold', async () => {
    // Written past the model, which no longer knows the field.
    await mongoose.connection
      .collection('settings')
      .updateOne({ key: 'site' }, { $set: { 'newsletter.enabled': false } });

    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', auth());

    expectToMatchContract(res, 'get', '/api/v1/admin/settings');
    expect(res.body.data.newsletter).not.toHaveProperty('enabled');
  });

  it('round-trips GET then PUT', async () => {
    const { body, revision } = await getSettings();

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send(editable(body));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'put', '/api/v1/admin/settings');
    expect(editable(res.body.data)).toEqual(editable(body));
  });

  it('patches one section and leaves the rest byte-identical', async () => {
    const before = await getSettings();
    const untouched = { ...editable(before.body) };
    delete untouched.socials;

    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(before.revision))
      .send({ socials: { ...(before.body.socials as object), x: 'https://x.com/spaajibade' } });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'patch', '/api/v1/admin/settings');

    const after = editable(res.body.data);
    expect((after.socials as { x: string }).x).toBe('https://x.com/spaajibade');
    delete after.socials;
    expect(after).toEqual(untouched);
  });

  it('returns 400 with the field path when the merged result is invalid', async () => {
    const { revision } = await getSettings();

    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ foundedYear: 1200 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('foundedYear');
  });

  it('returns 409 when someone else saved first', async () => {
    const { revision } = await getSettings();

    const first = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ tagline: 'Theirs' });

    expect(first.status).toBe(200);

    // The same revision again: this editor is working from a stale read.
    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ tagline: 'Mine' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('is visible on the public site endpoint immediately', async () => {
    const { revision } = await getSettings();

    await request(app).get('/api/v1/site');

    await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ tagline: 'Counsel for the long term' });

    const res = await request(app).get('/api/v1/site');
    expect(res.body.data.settings.tagline).toBe('Counsel for the long term');
  });
});

describe('legal pages (ADR-057)', () => {
  const getLegal = async (): Promise<request.Response> =>
    request(app).get('/api/v1/admin/legal/terms').set('Authorization', auth());

  it('returns the editable shape, including its status', async () => {
    const res = await getLegal();

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/legal/{key}');
    expect(res.body.data).toMatchObject({ key: 'terms', status: 'published' });
  });

  it('round-trips GET then PUT, and sanitises the body on the way in', async () => {
    const { body } = await getLegal();
    const { id, key, revision, updatedAt, ...editableBody } = body.data as Record<string, unknown>;

    const res = await request(app)
      .put('/api/v1/admin/legal/terms')
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ ...editableBody, body: '<p>Terms.</p><script>alert(1)</script>' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expectToMatchContract(res, 'put', '/api/v1/admin/legal/{key}');
    expect(res.body.data.body).toBe('<p>Terms.</p>');
    expect(res.body.data.revision).toBe(Number(revision) + 1);
  });

  it('takes a page off the public site when its status is set to draft', async () => {
    const { body } = await getLegal();

    await request(app)
      .put('/api/v1/admin/legal/terms')
      .set('Authorization', auth())
      .set('If-Match', String(body.data.revision))
      .send({ status: 'draft', title: body.data.title, body: body.data.body });

    expect((await request(app).get('/api/v1/legal/terms')).status).toBe(404);
  });

  it('returns 400 naming the field for a status that does not exist', async () => {
    const { body } = await getLegal();

    const res = await request(app)
      .put('/api/v1/admin/legal/terms')
      .set('Authorization', auth())
      .set('If-Match', String(body.data.revision))
      .send({ status: 'archived', title: 'Terms of Service', body: '<p>Terms.</p>' });

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'put', '/api/v1/admin/legal/{key}');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('status');
  });

  it('returns 409 when someone else saved first', async () => {
    const res = await request(app)
      .put('/api/v1/admin/legal/terms')
      .set('Authorization', auth())
      .set('If-Match', '99')
      .send({ status: 'published', title: 'Terms of Service', body: '<p>Terms.</p>' });

    expect(res.status).toBe(409);
    expectToMatchContract(res, 'put', '/api/v1/admin/legal/{key}');
  });

  it('returns 404 for a key that names no legal page', async () => {
    const res = await request(app).get('/api/v1/admin/legal/cookies').set('Authorization', auth());

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/admin/legal/{key}');
  });
});
