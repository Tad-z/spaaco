import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { runSeed } from '../../../scripts/seed.js';
import { Insight, Media, Person, PracticeArea } from '../../../src/models/index.js';
import { makeDocumentMedia, makeMedia } from '../../support/factories.js';
import { createTestUser } from '../../support/auth.js';
import { normalise, readFixture } from '../../support/fixtures.js';

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
  it('returns the directory with pagination meta, as the fixture has it', async () => {
    const res = await request(app).get('/api/v1/people');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/people');
    expect(res.body.meta).toEqual({ page: 1, pageSize: 9, total: 9, totalPages: 1 });
    // Card backs included: chips and the italic line (ADR-052).
    expect(normalise(res.body)).toEqual(normalise(readFixture('people.list.json')));
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

  describe('the practice-area filter (ADR-054)', () => {
    it('matches the areas on the card', async () => {
      const res = await request(app).get('/api/v1/people?practiceArea=energy-natural-resources');

      expect(names(res.body)).toEqual(['Peter Olalere']);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 9, total: 1, totalPages: 1 });
      expectToMatchContract(res, 'get', '/api/v1/people');
    });

    it('matches the primary practice area too', async () => {
      const tax = await PracticeArea.findOne({ slug: 'tax' }).lean();
      await Person.updateOne({ slug: 'emmanuel-bassey' }, { primaryPracticeArea: tax?._id });

      const res = await request(app).get('/api/v1/people?practiceArea=tax');

      expect(names(res.body)).toEqual(['Emmanuel Bassey']);
    });

    it('combines with the role tab, and the Partners tab still includes the MP', async () => {
      const res = await request(app).get(
        '/api/v1/people?role=partner&practiceArea=dispute-resolution-arbitration'
      );

      expect(names(res.body)).toEqual(['Dr. Babatunde Ajibade, SAN', 'Dr. Kolawole Mayomi']);
      expect(res.body.meta.total).toBe(2);
    });

    it('reports meta for the combined filter across pages', async () => {
      const res = await request(app).get(
        '/api/v1/people?role=partner&practiceArea=dispute-resolution-arbitration&page=2&pageSize=1'
      );

      expect(names(res.body)).toEqual(['Dr. Kolawole Mayomi']);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('returns an empty page for a combination nobody matches', async () => {
      const res = await request(app).get(
        '/api/v1/people?role=associate_partner&practiceArea=dispute-resolution-arbitration'
      );

      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 9, total: 0, totalPages: 0 });
    });

    it('returns an empty page, not a 404, for an unknown area', async () => {
      const res = await request(app).get('/api/v1/people?practiceArea=shipping');

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(0);
      expectToMatchContract(res, 'get', '/api/v1/people');
    });
  });

  it('accepts the Trainee Associates tab, and no longer the NYSC one', async () => {
    await Person.updateOne({ slug: 'david-essien' }, { role: 'trainee_associate' });

    const trainees = await request(app).get('/api/v1/people?role=trainee_associate');
    const nysc = await request(app).get('/api/v1/people?role=nysc_associate');

    expect(names(trainees.body)).toEqual(['David Essien']);
    expect(trainees.body.data[0].roleLabel).toBe('Trainee Associate');
    expect(nysc.status).toBe(400);
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
  it('serves the Managing Partner as the fixture has him', async () => {
    const res = await request(app).get('/api/v1/people/babatunde-ajibade');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/people/{slug}');
    expect(normalise(res.body)).toEqual(
      normalise(readFixture('people.detail.babatunde-ajibade.json'))
    );
  });

  it('returns their recent publications, never a pro bono story', async () => {
    const john = await Person.findOne({ slug: 'john-onyido' }).lean();
    await Insight.updateMany({ categories: 'pro_bono' }, { author: john?._id });

    const res = await request(app).get('/api/v1/people/john-onyido');

    expectToMatchContract(res, 'get', '/api/v1/people/{slug}');
    expect(res.body.data.office.name).toBe('Lagos');
    expect(res.body.data.recentPublications).toHaveLength(1);
  });

  it('returns 404 for an unknown attorney', async () => {
    const res = await request(app).get('/api/v1/people/nobody-here');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/people/{slug}');
  });
});

describe('GET /api/v1/insights', () => {
  it('returns cards newest first with pagination meta, as the fixture has them', async () => {
    const res = await request(app).get('/api/v1/insights');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/insights');
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data[0].publishedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(normalise(res.body)).toEqual(normalise(readFixture('insights.list.json')));
  });

  it('shows the category cover on an insight without its own, set on the Insights page (ADR-063)', async () => {
    const card = await Media.create(
      makeMedia({ alt: 'Articles', url: 'https://example.com/articles.png' })
    );
    const own = await Media.create(
      makeMedia({ alt: 'Own cover', url: 'https://example.com/own.png' })
    );
    await Insight.updateMany({}, { categories: ['articles'], coverImage: null });
    const kept = await Insight.findOneAndUpdate(
      {},
      { coverImage: own._id },
      { sort: { publishedAt: -1 } }
    );

    const { token } = await createTestUser({ roles: ['editor'] });
    const page = await request(app)
      .get('/api/v1/admin/pages/insights')
      .set('Authorization', `Bearer ${token}`);
    const patched = await request(app)
      .patch('/api/v1/admin/pages/insights')
      .set('Authorization', `Bearer ${token}`)
      .set('If-Match', String(page.body.data.revision))
      .send({ categoryCovers: { articles: card._id.toString() } });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    const res = await request(app).get('/api/v1/insights');

    expectToMatchContract(res, 'get', '/api/v1/insights');
    const covers = res.body.data.map(
      (insight: { slug: string; coverImage: { url: string } | null }) => [
        insight.slug === kept?.slug,
        insight.coverImage?.url,
      ]
    );
    expect(covers).toEqual(
      covers.map(([isKept]: [boolean]) => [
        isKept,
        isKept ? 'https://example.com/own.png' : 'https://example.com/articles.png',
      ])
    );
  });

  describe('pro bono stories (ADR-049)', () => {
    const categoriesOf = (body: { data: { categories: string[] }[] }): string[] =>
      body.data.flatMap((card) => card.categories);

    it('are absent from the unfiltered listing, which is "All insights & news"', async () => {
      const res = await request(app).get('/api/v1/insights?pageSize=50');

      expect(categoriesOf(res.body)).not.toContain('pro_bono');
      expect(res.body.meta.total).toBe(4);
    });

    it('are absent from another category, even when tagged with it too', async () => {
      await Insight.updateMany({ categories: 'pro_bono' }, { categories: ['pro_bono', 'events'] });

      const res = await request(app).get('/api/v1/insights?category=events');

      expect(categoriesOf(res.body)).not.toContain('pro_bono');
      expect(res.body.meta.total).toBe(1);
    });

    it('are absent from the featured carousel and Home, whatever their flags', async () => {
      await Insight.updateMany(
        { categories: 'pro_bono' },
        { featured: true, publishedAt: new Date('2026-09-01T00:00:00.000Z') }
      );

      const home = await request(app).get('/api/v1/pages/home');
      const insights = await request(app).get('/api/v1/pages/insights');

      expect(
        home.body.data.latestInsights.flatMap((card: { categories: string[] }) => card.categories)
      ).not.toContain('pro_bono');
      expect(
        insights.body.data.featured.flatMap((card: { categories: string[] }) => card.categories)
      ).not.toContain('pro_bono');
    });

    it('are the Responsible Business grid when asked for by name, 9 per page', async () => {
      const first = await request(app).get('/api/v1/insights?category=pro_bono');
      const second = await request(app).get('/api/v1/insights?category=pro_bono&page=2');

      expectToMatchContract(first, 'get', '/api/v1/insights');
      expect(first.body.data).toHaveLength(9);
      expect(first.body.meta).toEqual({ page: 1, pageSize: 9, total: 12, totalPages: 2 });
      expect(second.body.data).toHaveLength(3);
      expect(first.body.data[0].chips).toEqual(['Pro Bono & Community Commitment']);
      expect(first.body.data[0].author).toMatchObject({ type: 'firm' });
    });
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
    // Built here rather than taken from the seed: the seed is the firm's real
    // copy, and the one video article in it became an article when it turned
    // out the firm has not supplied the URL yet. A feature test should not
    // depend on which format their content happens to be in this week.
    await Insight.create({
      title: 'A Recorded Webinar On The New Practice Directions',
      slug: 'a-recorded-webinar',
      format: 'video',
      videoUrl: 'https://www.youtube.com/watch?v=spaajibade',
      categories: ['events'],
      status: 'published',
      publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/v1/insights?category=events');

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
  const TRADE_SECRETS =
    'repositioning-and-promoting-energy-investments-between-south-africa-and-nigeria-a-perspective-on-trade-secrets';

  it('returns the detail with related insights, as the fixture has it', async () => {
    const res = await request(app).get(`/api/v1/insights/${TRADE_SECRETS}`);

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
    expect(res.body.data.related.map((r: { slug: string }) => r.slug)).not.toContain(TRADE_SECRETS);
    expect(normalise(res.body)).toEqual(
      normalise(readFixture('insights.detail.trade-secrets.json'))
    );
  });

  describe('the link after the body (ADR-051)', () => {
    it('reads "Read Article" to the external article', async () => {
      await Insight.updateOne(
        { slug: TRADE_SECRETS },
        { externalUrl: 'https://www.spaajibade.com/briefs/trade-secrets' }
      );

      const res = await request(app).get(`/api/v1/insights/${TRADE_SECRETS}`);

      expect(res.body.data.cta).toEqual({
        label: 'Read Article',
        url: 'https://www.spaajibade.com/briefs/trade-secrets',
      });
      expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
    });

    it('reads "Read Article" to the uploaded PDF', async () => {
      const pdf = await Media.create(makeDocumentMedia());
      await Insight.updateOne({ slug: TRADE_SECRETS }, { document: pdf._id });

      const res = await request(app).get(`/api/v1/insights/${TRADE_SECRETS}`);

      expect(res.body.data.cta).toEqual({ label: 'Read Article', url: pdf.url });
    });

    it('reads "Watch Video" to the video', async () => {
      // Built here rather than taken from the seed: the seed's video insights
      // are articles until the firm supplies the links (ADR-042).
      await Insight.create({
        title: 'A Recorded Webinar On The New Practice Directions',
        slug: 'a-recorded-webinar',
        format: 'video',
        videoUrl: 'https://www.youtube.com/watch?v=spaajibade',
        categories: ['events'],
        status: 'published',
        publishedAt: new Date('2026-07-01T00:00:00.000Z'),
      });

      const res = await request(app).get('/api/v1/insights/a-recorded-webinar');

      expect(res.body.data.videoUrl).toBe('https://www.youtube.com/watch?v=spaajibade');
      expect(res.body.data.cta).toEqual({
        label: 'Watch Video',
        url: 'https://www.youtube.com/watch?v=spaajibade',
      });
    });
  });

  it('sends a pro bono story back to Responsible Business, among other pro bono stories', async () => {
    const res = await request(app).get(
      '/api/v1/insights/spa-ajibade-co-sponsors-team-titans-an-american-flag-football-team'
    );

    expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
    expect(res.body.data.backLink).toEqual({
      label: 'Back to Pro Bono & Community Commitment',
      href: '/responsible-business',
      kind: 'internal',
    });
    expect(
      res.body.data.related.flatMap((card: { categories: string[] }) => card.categories)
    ).toEqual(['pro_bono', 'pro_bono', 'pro_bono']);
  });

  it('returns 404 for an unknown insight', async () => {
    const res = await request(app).get('/api/v1/insights/nothing-here');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/insights/{slug}');
  });
});
