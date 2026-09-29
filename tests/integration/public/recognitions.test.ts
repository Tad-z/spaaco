import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { normalise, readFixture } from '../../support/fixtures.js';
import { runSeed } from '../../../scripts/seed.js';
import { Award, Page, RecognitionDirectory } from '../../../src/models/index.js';

/**
 * Recognition directories and their awards (ADR-056).
 *
 * Draft exclusion is proved here once for the resource, as ADR-029 asks, and
 * covers both routes by which an award can leave the site: its own status,
 * and its directory's.
 */

setupTestDb();

const app = buildTestApp();

beforeEach(async () => {
  await runSeed();
});

interface AwardBody {
  title: string;
  year: number;
  directory: { slug: string };
}

const awardsOf = (body: unknown): AwardBody[] =>
  (body as { data: { awards: AwardBody[] } }).data.awards;

const homeBadges = async (): Promise<AwardBody[]> => {
  const res = await request(app).get('/api/v1/pages/home');
  return (res.body as { data: { recognitionSection: { badges: AwardBody[] } } }).data
    .recognitionSection.badges;
};

describe('GET /api/v1/recognitions', () => {
  it('serves the directories and the featured awards, as the fixture has them', async () => {
    const res = await request(app).get('/api/v1/recognitions');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/recognitions');
    expect(normalise(res.body)).toEqual(normalise(readFixture('recognitions.list.json')));
  });
});

describe('GET /api/v1/recognitions/{slug}', () => {
  it('serves a directory page, as the fixture has it', async () => {
    const res = await request(app).get('/api/v1/recognitions/iflr-1000');

    expect(res.status).toBe(200);
    expectToMatchContract(res, 'get', '/api/v1/recognitions/{slug}');
    expect(normalise(res.body)).toEqual(
      normalise(readFixture('recognitions.detail.iflr-1000.json'))
    );
  });

  it('lists the awards newest year first, keeping the firm order within a year', async () => {
    const res = await request(app).get('/api/v1/recognitions/iflr-1000');

    expect(awardsOf(res.body).map((award) => award.year)).toEqual([2026, 2025, 2024, 2024]);
  });

  it('takes the shared eyebrow and CTAs from the recognition page document', async () => {
    await Page.updateOne(
      { key: 'recognition' },
      { $set: { 'directoryPage.awardsEyebrow': 'Honours by year' } }
    );

    const res = await request(app).get('/api/v1/recognitions/chambers-global');

    expect(res.body.data.awardsEyebrow).toBe('Honours by year');
    expect(res.body.data.hero.title).toBe('Chambers Global');
  });

  it('returns 404 for a directory that does not exist', async () => {
    const res = await request(app).get('/api/v1/recognitions/the-lawyer-awards');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/recognitions/{slug}');
  });

  it('returns 400 for a malformed slug', async () => {
    const res = await request(app).get('/api/v1/recognitions/Not_A_Slug');

    expect(res.status).toBe(400);
    expectToMatchContract(res, 'get', '/api/v1/recognitions/{slug}');
  });
});

describe('draft exclusion', () => {
  it('never shows a draft award on Home or on its directory page', async () => {
    await Award.updateOne({ slug: 'iflr1000-recommended-firm-2024-a' }, { status: 'draft' });

    const badges = await homeBadges();
    const page = await request(app).get('/api/v1/recognitions/iflr-1000');

    expect(badges).toHaveLength(3);
    expect(awardsOf(page.body)).toHaveLength(3);
  });

  it('takes a draft directory off the site, with every award under it', async () => {
    await RecognitionDirectory.updateOne({ slug: 'iflr-1000' }, { status: 'draft' });

    const page = await request(app).get('/api/v1/recognitions/iflr-1000');
    const overview = await request(app).get('/api/v1/recognitions');
    const about = await request(app).get('/api/v1/pages/about');

    expect(page.status).toBe(404);
    // The two IFLR badges go from Home and the Achievements tab with it.
    expect((await homeBadges()).map((award) => award.directory.slug)).not.toContain('iflr-1000');
    expect(overview.body.data.achievements).toHaveLength(2);
    expect(
      about.body.data.awardsList.items.map((item: { slug: string }) => item.slug)
    ).not.toContain('iflr-1000');
  });
});
