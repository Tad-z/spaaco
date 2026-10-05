import mongoose from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { createTestUser } from '../../support/auth.js';
import { runSeed } from '../../../scripts/seed.js';
import {
  AuditLog,
  Insight,
  Media,
  Person,
  PracticeArea,
  RecognitionDirectory,
} from '../../../src/models/index.js';
import * as cache from '../../../src/core/cache.js';
import { ADMIN_COLLECTIONS } from '../../../src/constants/content-collections.js';
import { makeDocumentMedia } from '../../support/factories.js';

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
    expectToMatchContract(res, 'get', '/api/v1/admin/content/practice-areas');
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
    const res = await request(app).get(`${base}/practice-areas?q=.*`).set('Authorization', auth());

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
    expectToMatchContract(res, 'get', '/api/v1/admin/content/practice-areas/{id}');

    const { image, _expanded } = res.body.data;
    expect(typeof image).toBe('string');
    expect(_expanded[image]).toMatchObject({ kind: 'media' });
    expect(_expanded[image].url).toContain('placehold.co');
  });

  it('round-trips: the GET body, minus read-only fields, is a valid PATCH body', async () => {
    const { id } = await getTax();
    const read = await request(app)
      .get(`${base}/practice-areas/${id}`)
      .set('Authorization', auth());

    const {
      id: _id,
      revision,
      createdAt,
      updatedAt,
      publishedAt,
      status,
      order,
      _expanded,
      ...writable
    } = read.body.data;

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
    expectToMatchContract(res, 'patch', '/api/v1/admin/content/practice-areas/{id}');
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

    // 428, not 400: nothing about the request is malformed, the precondition
    // is simply absent — which is the status the spec declares for it.
    expect(res.status).toBe(428);
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
      .send({
        title: 'Shipping & Admiralty',
        shortLabel: 'Shipping',
        summary: 'A new practice.',
        homeSummary: 'A new practice.',
        heroIntro: 'A new practice.',
        coreServices: [{ title: 'Charterparties', description: 'Drafting and disputes.' }],
      });

    expect(res.status).toBe(201);
    expectToMatchContract(res, 'post', '/api/v1/admin/content/practice-areas');
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

describe("an article's link (ADR-051)", () => {
  const pdf = async (): Promise<string> => {
    const created = await Media.create(makeDocumentMedia());
    return created._id.toHexString();
  };

  it('refuses both an external URL and a document in one write', async () => {
    const res = await request(app)
      .post(`${base}/insights`)
      .set('Authorization', auth())
      .send({
        title: 'Both at once',
        format: 'article',
        categories: ['articles'],
        externalUrl: 'https://example.com/brief',
        document: await pdf(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('document');
  });

  it('refuses a document added to an article that already links out', async () => {
    const created = await request(app)
      .post(`${base}/insights`)
      .set('Authorization', auth())
      .send({
        title: 'Links out',
        format: 'article',
        categories: ['articles'],
        externalUrl: 'https://example.com/brief',
      });

    const res = await request(app)
      .patch(`${base}/insights/${created.body.data.id as string}`)
      .set('Authorization', auth())
      .set('If-Match', String(created.body.data.revision))
      .send({ document: await pdf() });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('document');
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
    expectToMatchContract(published, 'post', '/api/v1/admin/content/faqs/{id}/publish');
    expect(published.body.data.status).toBe('published');

    const first: string = published.body.data.publishedAt;

    await request(app).post(`${base}/faqs/${id}/unpublish`).set('Authorization', auth());
    const again = await request(app)
      .post(`${base}/faqs/${id}/publish`)
      .set('Authorization', auth());

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

describe('content imports (ADR-059)', () => {
  const wordpressDate = '2019-05-12T09:00:00+01:00';

  it('keeps the source publish date through publishing, and never shows provenance publicly', async () => {
    const created = await request(app)
      .post(`${base}/insights`)
      .set('Authorization', auth())
      .send({
        slug: 'old-wordpress-article',
        title: 'An Article From The Old Site',
        format: 'article',
        categories: ['articles'],
        body: '<p>Imported.</p>',
        legacyImport: { source: 'wordpress', legacyId: 5521, publishedAt: wordpressDate },
      });

    expect(created.status).toBe(201);
    expectToMatchContract(created, 'post', '/api/v1/admin/content/insights');
    expect(created.body.data.legacy).toMatchObject({ source: 'wordpress', legacyId: 5521 });

    const published = await request(app)
      .post(`${base}/insights/${created.body.data.id as string}/publish`)
      .set('Authorization', auth());
    expect(published.body.data.publishedAt).toBe(new Date(wordpressDate).toISOString());

    const audit = await AuditLog.findOne({ action: 'insights.create' }).lean();
    expect(audit?.meta).toMatchObject({ legacyImport: { legacyId: 5521 } });

    const pub = await request(app).get('/api/v1/insights/old-wordpress-article');
    expect(pub.status).toBe(200);
    expect(pub.body.data.publishedAt).toBe(new Date(wordpressDate).toISOString());
    expect(JSON.stringify(pub.body)).not.toContain('legacy');
  });

  it('rejects a publish date on an attorney import, which has none to keep', async () => {
    const res = await request(app)
      .post(`${base}/people`)
      .set('Authorization', auth())
      .send({
        firstName: 'Ada',
        lastName: 'Imported',
        role: 'associate',
        legacyImport: { source: 'wordpress', legacyId: 1873, publishedAt: wordpressDate },
      });

    expect(res.status).toBe(400);
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
    expectToMatchContract(res, 'delete', '/api/v1/admin/content/practice-areas/{id}');
  });

  it('refuses to delete a recognition directory that still has awards (ADR-056)', async () => {
    const directory = await RecognitionDirectory.findOne({ slug: 'iflr-1000' }).lean();

    const res = await request(app)
      .delete(`${base}/recognition-directories/${directory?._id.toString() ?? ''}`)
      .set('Authorization', auth());

    expect(res.status).toBe(409);
    expect(res.body.error.details[0].path).toBe('Award.directory');
  });

  it('refuses to delete an industry a practice area still picks (ADR-048)', async () => {
    const res = await request(app).get(`${base}/industries?q=Oil`).set('Authorization', auth());
    const id = (res.body as { data: { id: string }[] }).data[0]?.id ?? '';

    const deleted = await request(app)
      .delete(`${base}/industries/${id}`)
      .set('Authorization', auth());

    expect(deleted.status).toBe(409);
    expect(deleted.body.error.details[0]).toEqual({
      path: 'PracticeArea.industries',
      message: 'Energy & Natural Resources',
    });
  });

  it('deletes once the references are gone', async () => {
    const area = await PracticeArea.findOne({ slug: 'energy-natural-resources' }).lean();
    await Insight.updateMany({}, { $pull: { practiceAreas: area?._id } });
    await Person.updateMany({}, { $pull: { practiceAreas: area?._id } });

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
    const res = await request(app).post(`${base}/faqs`).set('Authorization', auth()).send({
      question: 'Is HTML sanitised?',
      answer: '<p>Safe.</p><script>alert(1)</script><p onclick="steal()">Also safe.</p>',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.answer).not.toContain('script');
    expect(res.body.data.answer).not.toContain('onclick');
    expect(res.body.data.answer).toContain('<p>Safe.</p>');
  });

  it('keeps the formatting a legal article needs', async () => {
    const res = await request(app).post(`${base}/faqs`).set('Authorization', auth()).send({
      question: 'Is formatting kept?',
      answer:
        '<h2>Heading</h2><ul><li><strong>Bold</strong></li></ul><blockquote>Quote</blockquote>',
    });

    expect(res.body.data.answer).toContain('<h2>');
    expect(res.body.data.answer).toContain('<strong>');
    expect(res.body.data.answer).toContain('<blockquote>');
  });

  it('removes a javascript: link, which is an execution vector', async () => {
    const res = await request(app).post(`${base}/faqs`).set('Authorization', auth()).send({
      question: 'Are links checked?',
      answer: '<p><a href="javascript:alert(1)">x</a></p>',
    });

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
  /**
   * Where a published record shows up publicly. Awards, industries and FAQs
   * have no detail endpoint of their own — they are only ever embedded.
   */
  const PUBLIC_PATHS: Partial<Record<string, string>> = {
    'practice-areas': '/api/v1/practice-areas',
    people: '/api/v1/people',
    insights: '/api/v1/insights',
    'recognition-directories': '/api/v1/recognitions',
    jobs: '/api/v1/jobs',
  };

  /** An award needs a directory, which only exists once the seed has run. */
  let directoryId = '';
  beforeEach(async () => {
    const directory = await RecognitionDirectory.findOne({ slug: 'legal-500' })
      .select('_id')
      .lean<{ _id: { toString: () => string } } | null>();
    directoryId = directory?._id.toString() ?? '';
  });

  const smokeBody = (collection: string): Record<string, unknown> => {
    const bodies: Record<string, Record<string, unknown>> = {
      'practice-areas': {
        title: 'Smoke Area',
        shortLabel: 'Smoke',
        summary: 'A summary.',
        homeSummary: 'A Home summary.',
        heroIntro: 'A hero paragraph.',
        coreServices: [{ title: 'Smoke Service', description: 'A service.' }],
      },
      people: { firstName: 'Smoke', lastName: 'Tester', role: 'associate' },
      insights: { title: 'Smoke Insight', format: 'article', categories: ['articles'] },
      offices: { name: 'Smoketown', address: '1 Smoke Street', hours: '9 to 5' },
      'recognition-directories': { name: 'Smoke Rankings' },
      awards: { directory: directoryId, title: 'Smoke Award', year: 2026 },
      industries: { name: 'Smoke & Mirrors' },
      faqs: { question: 'Does it smoke?', answer: '<p>Yes.</p>' },
      jobs: {
        title: 'Smoke Associate',
        description: '<p>A role.</p>',
        employmentType: 'full_time',
        workMode: 'hybrid',
      },
    };
    return bodies[collection] ?? {};
  };

  it.each(ADMIN_COLLECTIONS.map((collection) => ({ collection })))(
    '$collection supports create, update with If-Match, publish and public read',
    async ({ collection }) => {
      const created = await request(app)
        .post(`${base}/${collection}`)
        .set('Authorization', auth())
        .send(smokeBody(collection));

      expect(created.status, JSON.stringify(created.body)).toBe(201);
      // Each collection has its own response schema now (ADR-033), and this is
      // the only place six of the seven are exercised at all.
      expectToMatchContract(created, 'post', `/api/v1/admin/content/${collection}`);

      const id: string = created.body.data.id;

      const updated = await request(app)
        .patch(`${base}/${collection}/${id}`)
        .set('Authorization', auth())
        .set('If-Match', String(created.body.data.revision))
        .send({ slug: `smoke-${collection}` });

      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expectToMatchContract(updated, 'patch', `/api/v1/admin/content/${collection}/{id}`);

      const published = await request(app)
        .post(`${base}/${collection}/${id}/publish`)
        .set('Authorization', auth());

      expect(published.status).toBe(200);
      expect(published.body.data.status).toBe('published');
      expectToMatchContract(published, 'post', `/api/v1/admin/content/${collection}/{id}/publish`);

      // And the public read the test's name promises: publishing has to make
      // the record reachable without a token, which is the whole point of it.
      const publicPath = PUBLIC_PATHS[collection];
      if (publicPath !== undefined) {
        const slugOrId = collection === 'jobs' ? id : `smoke-${collection}`;
        const seen = await request(app).get(`${publicPath}/${slugOrId}`);

        expect(seen.status, `${publicPath}/${slugOrId}: ${JSON.stringify(seen.body)}`).toBe(200);
      }
    }
  );

  /**
   * The rest of each collection's operations, asserted against its own schema.
   *
   * One generic handler serves all seven, so this is not seven times the
   * behavioural coverage — it is the contract half. ADR-033 gave every
   * collection its own request and response schemas, and a schema nothing ever
   * validates against is a promise to the frontend that nobody has checked.
   */
  it.each(ADMIN_COLLECTIONS.map((collection) => ({ collection })))(
    '$collection matches its schema on list, read, reorder, unpublish and delete',
    async ({ collection }) => {
      const created = await request(app)
        .post(`${base}/${collection}`)
        .set('Authorization', auth())
        .send(smokeBody(collection));

      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id: string = created.body.data.id;

      const list = await request(app).get(`${base}/${collection}`).set('Authorization', auth());
      expect(list.status).toBe(200);
      expectToMatchContract(list, 'get', `/api/v1/admin/content/${collection}`);

      const read = await request(app)
        .get(`${base}/${collection}/${id}`)
        .set('Authorization', auth());
      expect(read.status).toBe(200);
      expectToMatchContract(read, 'get', `/api/v1/admin/content/${collection}/{id}`);

      const reordered = await request(app)
        .patch(`${base}/${collection}/reorder`)
        .set('Authorization', auth())
        .send({ ids: [id] });
      expect(reordered.status, JSON.stringify(reordered.body)).toBe(204);
      expectToMatchContract(reordered, 'patch', `/api/v1/admin/content/${collection}/reorder`);

      const unpublished = await request(app)
        .post(`${base}/${collection}/${id}/unpublish`)
        .set('Authorization', auth());
      expect(unpublished.status).toBe(200);
      expectToMatchContract(
        unpublished,
        'post',
        `/api/v1/admin/content/${collection}/{id}/unpublish`
      );

      // Nothing references a record created moments ago, so this is the clean
      // delete path rather than the 409.
      const deleted = await request(app)
        .delete(`${base}/${collection}/${id}`)
        .set('Authorization', auth());
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      expectToMatchContract(deleted, 'delete', `/api/v1/admin/content/${collection}/{id}`);
    }
  );
});
