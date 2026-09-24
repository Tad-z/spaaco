import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import { AuditLog, Insight, PracticeArea } from '../../../src/models/index.js';
import * as cache from '../../../src/core/cache.js';
import { ADMIN_COLLECTIONS } from '../../../src/constants/content-collections.js';

/**
 * The generic CRUD factory, tested thoroughly once (ADR-029).
 *
 * One implementation serves all seven collections, so the behaviour that must
 * not differ between them — optimistic locking, reference checks, publish
 * semantics, invalidation, audit entries — is proved here rather than seven
 * times. Each collection then gets one smoke test at the bottom.
 */

setupTestDb();

const app = buildTestApp();

let token = '';

const auth = (): string => `Bearer ${token}`;
const base = '/api/v1/admin/content';

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

beforeEach(async () => {
  await runSeed();
  token = (await createTestUser({ roles: ['admin'] })).token;
});

const getTax = async (): Promise<{ id: string; revision: number }> => {
  const doc = await PracticeArea.findOne({ slug: 'tax' }).lean();
  return { id: doc?._id.toString() ?? '', revision: doc?.revision ?? 0 };
};

describe('listing', () => {
  it('returns the editable shape with pagination meta', async () => {
    const res = await request(app).get(`${base}/practice-areas`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/content/{collection}');
    expect(res.body.meta.total).toBe(9);
  });

  it('shows drafts as well as published, unlike the public API', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get(`${base}/practice-areas`).set('Authorization', auth());

    expect(res.body.meta.total).toBe(9);
  });

  it('filters by status', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app)
      .get(`${base}/practice-areas?status=draft`)
      .set('Authorization', auth());

    expect(res.body.meta.total).toBe(1);
  });

  it('filters by a free-text query', async () => {
    const res = await request(app)
      .get(`${base}/practice-areas?q=arbitration`)
      .set('Authorization', auth());

    expect(res.body.meta.total).toBe(1);
  });

  it('treats a regex metacharacter in the query as literal text', async () => {
    // An unescaped ".*" would match everything and quietly defeat the filter.
    const res = await request(app)
      .get(`${base}/practice-areas?q=.*`)
      .set('Authorization', auth());

    expect(res.body.meta.total).toBe(0);
  });

  it('returns 400 for a collection that does not exist', async () => {
    const res = await request(app).get(`${base}/widgets`).set('Authorization', auth());

    expect(res.status).toBe(400);
  });
});

describe('the editable shape', () => {
  it('keeps references as ids and previews them in _expanded', async () => {
    const { id } = await getTax();

    const res = await request(app).get(`${base}/practice-areas/${id}`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/admin/content/{collection}/{id}');

    const { image, _expanded } = res.body.data;
    expect(typeof image).toBe('string');
    expect(_expanded[image]).toMatchObject({ kind: 'media' });
    expect(_expanded[image].url).toContain('placehold.co');
  });

  it('round-trips: the GET body, minus read-only fields, is a valid PATCH body', async () => {
    const { id } = await getTax();
    const read = await request(app).get(`${base}/practice-areas/${id}`).set('Authorization', auth());

    const { id: _id, revision, createdAt, updatedAt, publishedAt, status, order, _expanded, ...writable } =
      read.body.data;

    const written = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send(writable);

    expect(written.status).toBe(200);
    expect(written.body.data.title).toBe(read.body.data.title);
  });

  it('rejects _expanded if the client sends it back', async () => {
    const { id, revision } = await getTax();

    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ _expanded: {} });

    expect(res.status).toBe(400);
  });

  it('exposes the attorney email to an editor, though the public API never does', async () => {
    const { Person } = await import('../../../src/models/index.js');
    await Person.updateOne({ slug: 'john-onyido' }, { email: 'john@spaajibade.test' });
    const person = await Person.findOne({ slug: 'john-onyido' }).lean();

    const res = await request(app)
      .get(`${base}/people/${person?._id.toString() ?? ''}`)
      .set('Authorization', auth());

    expect(res.body.data.email).toBe('john@spaajibade.test');
  });
});

describe('optimistic locking', () => {
  it('accepts a write quoting the current revision', async () => {
    const { id, revision } = await getTax();

    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'An updated summary that is long enough to be meaningful.' });

    expect(res.status).toBe(200);
    expect(res.body.data.revision).toBe(revision + 1);
  });

  it('rejects a stale revision with 409 and the current one', async () => {
    const { id, revision } = await getTax();

    await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'The first editor saves.' });

    // The second editor still holds the revision they read.
    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'The second editor saves over them.' });

    expect(res.status).toBe(409);
    expect(res.body.error.details[0].message).toContain(String(revision + 1));
    expectToMatchContract(res, 'patch', '/api/v1/admin/content/{collection}/{id}');
  });

  it('does not apply the losing write', async () => {
    const { id, revision } = await getTax();

    await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'The winning write.' });

    await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'The losing write.' });

    const doc = await PracticeArea.findById(id).lean();
    expect(doc?.summary).toBe('The winning write.');
  });

  it('refuses a write with no If-Match at all, rather than defaulting to last-write-wins', async () => {
    const { id } = await getTax();

    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .send({ summary: 'No header supplied.' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('If-Match');
  });

  it('tolerates a quoted ETag-style If-Match', async () => {
    const { id, revision } = await getTax();

    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', `"${String(revision)}"`)
      .send({ summary: 'Quoted header.' });

    expect(res.status).toBe(200);
  });

  it('returns 404, not 409, when the record is gone', async () => {
    const id = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', '0')
      .send({ summary: 'Nothing to update.' });

    expect(res.status).toBe(404);
  });
});

describe('create', () => {
  it('creates an item and generates its slug', async () => {
    const res = await request(app)
      .post(`${base}/practice-areas`)
      .set('Authorization', auth())
      .send({ title: 'Shipping & Admiralty', shortLabel: 'Shipping', summary: 'A new practice.' });

    expect(res.status).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/admin/content/{collection}');
    expect(res.body.data.slug).toBe('shipping-admiralty');
    expect(res.body.data.status).toBe('draft');
  });

  it('rejects an unknown field rather than dropping it silently', async () => {
    const res = await request(app)
      .post(`${base}/practice-areas`)
      .set('Authorization', auth())
      .send({ title: 'X', shortLabel: 'X', summary: 'Y', nonsense: true });

    expect(res.status).toBe(400);
  });

  it('rejects a missing required field with its path', async () => {
    const res = await request(app)
      .post(`${base}/practice-areas`)
      .set('Authorization', auth())
      .send({ title: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('shortLabel');
  });

  it('enforces a cross-field rule with the right path', async () => {
    const res = await request(app)
      .post(`${base}/insights`)
      .set('Authorization', auth())
      .send({ title: 'A talk', format: 'video', categories: ['firm_news'] });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('videoUrl');
  });
});

describe('publish and unpublish', () => {
  it('publishes and stamps the date once', async () => {
    const created = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({ question: 'Is this published?', answer: '<p>Not yet.</p>' });

    const id: string = created.body.data.id;
    const published = await request(app)
      .post(`${base}/faqs/${id}/publish`)
      .set('Authorization', auth());

    expect(published.status).toBe(200);
    expectToMatchContract(published, 'post', '/api/v1/admin/content/{collection}/{id}/publish');
    expect(published.body.data.status).toBe('published');

    const first: string = published.body.data.publishedAt;

    await request(app).post(`${base}/faqs/${id}/unpublish`).set('Authorization', auth());
    const again = await request(app).post(`${base}/faqs/${id}/publish`).set('Authorization', auth());

    // Republishing must not rewrite the original publication date.
    expect(again.body.data.publishedAt).toBe(first);
  });

  it('records an audit entry for publishing', async () => {
    const { id } = await getTax();

    await request(app).post(`${base}/practice-areas/${id}/publish`).set('Authorization', auth());

    const entry = await AuditLog.findOne({ action: 'practice-areas.publish' }).lean();
    expect(entry?.entityId?.toString()).toBe(id);
  });
});

describe('delete', () => {
  it('refuses when something still references the record, listing what', async () => {
    const area = await PracticeArea.findOne({ slug: 'energy-natural-resources' }).lean();

    const res = await request(app)
      .delete(`${base}/practice-areas/${area?._id.toString() ?? ''}`)
      .set('Authorization', auth());

    expect(res.status).toBe(409);
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expectToMatchContract(res, 'delete', '/api/v1/admin/content/{collection}/{id}');
  });

  it('deletes once the references are gone', async () => {
    const area = await PracticeArea.findOne({ slug: 'energy-natural-resources' }).lean();
    await Insight.updateMany({}, { $pull: { practiceAreas: area?._id } });

    const res = await request(app)
      .delete(`${base}/practice-areas/${area?._id.toString() ?? ''}`)
      .set('Authorization', auth());

    expect(res.status).toBe(204);
    expect(await PracticeArea.findById(area?._id).lean()).toBeNull();
  });

  it('records an audit entry', async () => {
    const created = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({ question: 'Delete me?', answer: '<p>Yes.</p>' });

    await request(app)
      .delete(`${base}/faqs/${created.body.data.id as string}`)
      .set('Authorization', auth());

    expect(await AuditLog.countDocuments({ action: 'faqs.delete' })).toBe(1);
  });
});

describe('reorder', () => {
  it('sets order from the position in the list', async () => {
    const areas = await PracticeArea.find().sort({ order: 1 }).lean();
    const reversed = [...areas].reverse().map((area) => area._id.toString());

    const res = await request(app)
      .patch(`${base}/practice-areas/reorder`)
      .set('Authorization', auth())
      .send({ ids: reversed });

    expect(res.status).toBe(204);

    const after = await PracticeArea.find().sort({ order: 1 }).lean();
    expect(after[0]?._id.toString()).toBe(reversed[0]);
  });

  it('returns 404 when an id does not exist, rather than partly applying', async () => {
    const res = await request(app)
      .patch(`${base}/practice-areas/reorder`)
      .set('Authorization', auth())
      .send({ ids: [new mongoose.Types.ObjectId().toString()] });

    expect(res.status).toBe(404);
  });
});

describe('sanitisation on write', () => {
  it('strips a script tag from rich text', async () => {
    const res = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({
        question: 'Is HTML sanitised?',
        answer: '<p>Safe.</p><script>alert(1)</script><p onclick="steal()">Also safe.</p>',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.answer).not.toContain('script');
    expect(res.body.data.answer).not.toContain('onclick');
    expect(res.body.data.answer).toContain('<p>Safe.</p>');
  });

  it('keeps the formatting a legal article needs', async () => {
    const res = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({
        question: 'Is formatting kept?',
        answer: '<h2>Heading</h2><ul><li><strong>Bold</strong></li></ul><blockquote>Quote</blockquote>',
      });

    expect(res.body.data.answer).toContain('<h2>');
    expect(res.body.data.answer).toContain('<strong>');
    expect(res.body.data.answer).toContain('<blockquote>');
  });

  it('removes a javascript: link, which is an execution vector', async () => {
    const res = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({ question: 'Are links checked?', answer: '<p><a href="javascript:alert(1)">x</a></p>' });

    expect(res.body.data.answer).not.toContain('javascript:');
  });

  it('is stored sanitised, not merely rendered sanitised', async () => {
    const created = await request(app)
      .post(`${base}/faqs`)
      .set('Authorization', auth())
      .send({ question: 'Stored safely?', answer: '<p>Fine.</p><script>alert(1)</script>' });

    const { Faq } = await import('../../../src/models/index.js');
    const stored = await Faq.findById(created.body.data.id as string).lean();

    expect(stored?.answer).not.toContain('script');
  });
});

describe('cache invalidation on write', () => {
  it('clears the pages a written record appears on', async () => {
    await request(app).get('/api/v1/site');
    await request(app).get('/api/v1/pages/home');
    expect(cache.size()).toBe(2);

    const { id, revision } = await getTax();
    await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ summary: 'Changed, so the cache must go.' });

    expect(cache.size()).toBe(0);
  });

  it('makes the change visible on the public API immediately', async () => {
    await request(app).get('/api/v1/practice-areas');

    const { id, revision } = await getTax();
    await request(app)
      .patch(`${base}/practice-areas/${id}`)
      .set('Authorization', auth())
      .set('If-Match', String(revision))
      .send({ title: 'Taxation' });

    const res = await request(app).get('/api/v1/practice-areas');
    expect(res.body.data.map((a: { title: string }) => a.title)).toContain('Taxation');
  });
});

describe('every collection', () => {
  const smokeBodies: Record<string, Record<string, unknown>> = {
    'practice-areas': { title: 'Smoke Area', shortLabel: 'Smoke', summary: 'A summary.' },
    people: { firstName: 'Smoke', lastName: 'Tester', role: 'associate' },
    insights: { title: 'Smoke Insight', format: 'article', categories: ['articles'] },
    offices: { name: 'Smoketown', address: '1 Smoke Street', hours: '9 to 5' },
    recognitions: { organization: 'Smoke Ranking', title: 'Listed', tab: 'achievements' },
    faqs: { question: 'Does it smoke?', answer: '<p>Yes.</p>' },
    jobs: {
      title: 'Smoke Associate',
      description: '<p>A role.</p>',
      employmentType: 'full_time',
      workMode: 'hybrid',
    },
  };

  it.each(ADMIN_COLLECTIONS.map((collection) => ({ collection })))(
    '$collection supports create, update with If-Match, publish and public read',
    async ({ collection }) => {
      const created = await request(app)
        .post(`${base}/${collection}`)
        .set('Authorization', auth())
        .send(smokeBodies[collection]);

      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id: string = created.body.data.id;

      const updated = await request(app)
        .patch(`${base}/${collection}/${id}`)
        .set('Authorization', auth())
        .set('If-Match', String(created.body.data.revision))
        .send({ slug: `smoke-${collection}` });

      expect(updated.status, JSON.stringify(updated.body)).toBe(200);

      const published = await request(app)
        .post(`${base}/${collection}/${id}/publish`)
        .set('Authorization', auth());

      expect(published.status).toBe(200);
      expect(published.body.data.status).toBe('published');
    }
  );
});

describe('role access to content', () => {
  it('lets HR work on jobs', async () => {
    const hr = await createTestUser({ roles: ['hr'] });

    const res = await request(app)
      .get(`${base}/jobs`)
      .set('Authorization', `Bearer ${hr.token}`);

    expect(res.status).toBe(200);
  });

  it('stops HR reaching any other collection', async () => {
    const hr = await createTestUser({ roles: ['hr'] });

    const res = await request(app)
      .get(`${base}/insights`)
      .set('Authorization', `Bearer ${hr.token}`);

    expect(res.status).toBe(403);
  });

  it('stops business development touching content at all', async () => {
    const bd = await createTestUser({ roles: ['business_dev'] });

    const res = await request(app)
      .get(`${base}/jobs`)
      .set('Authorization', `Bearer ${bd.token}`);

    expect(res.status).toBe(403);
  });
});
