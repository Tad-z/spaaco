import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../../support/build-app.js';
import { setupTestDb } from '../../support/setup-db.js';
import { expectToMatchContract } from '../../support/contract.js';
import { FIXTURE_DIR } from '../../support/spec.js';
import { runSeed } from '../../../scripts/seed.js';
import { Insight, Page, PracticeArea } from '../../../src/models/index.js';
import { signAccessToken } from '../../support/auth.js';
import { PAGE_KEYS } from '../../../src/constants/enums.js';

/**
 * Composed pages.
 *
 * The strongest assertion here is that the seeded API output deep-equals the
 * fixture the frontend builds against. Ids and image URLs differ per run, so
 * those are normalised away; everything else — copy, ordering, nesting,
 * nullability — must match exactly. If the two ever diverge, either the
 * composer is wrong or the fixture is stale, and both matter.
 */

setupTestDb();

const app = buildTestApp();

/** Replace values that legitimately vary between runs. */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (key === 'id') return [key, '<id>'];
      // Placeholder image URLs embed generated labels; the fixture and the
      // seed agree on the label but not on which record produced it.
      if ((key === 'url' || key === 'sm' || key === 'md' || key === 'lg') && typeof nested === 'string') {
        return [key, nested.replace(/\d+x\d+/, '<size>')];
      }
      return [key, normalise(nested)];
    })
  );
}

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));

beforeEach(async () => {
  await runSeed();
});

describe('GET /api/v1/pages/{key}', () => {
  it.each(PAGE_KEYS.values.map((key) => ({ key })))(
    '$key matches the contract',
    async ({ key }) => {
      const res = await request(app).get(`/api/v1/pages/${key}`);

      expect(res.status).toBe(200);
      expectToMatchContract(res, 'get', '/api/v1/pages/{key}');
      expect(res.body.data.key).toBe(key);
    }
  );

  it.each(PAGE_KEYS.values.map((key) => ({ key })))(
    '$key deep-equals its published fixture',
    async ({ key }) => {
      const res = await request(app).get(`/api/v1/pages/${key}`);

      expect(normalise(res.body)).toEqual(normalise(fixture(`pages.${key}.json`)));
    }
  );

  it('returns 400 for a key outside the eight', async () => {
    const res = await request(app).get('/api/v1/pages/contact');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectToMatchContract(res, 'get', '/api/v1/pages/{key}');
  });

  it('returns 404 when the page document is missing', async () => {
    await Page.deleteOne({ key: 'faq' });

    const res = await request(app).get('/api/v1/pages/faq');

    expect(res.status).toBe(404);
    expectToMatchContract(res, 'get', '/api/v1/pages/{key}');
  });
});

describe('computed stats', () => {
  it('derives the years-since-founding and office count rather than trusting stored text', async () => {
    const res = await request(app).get('/api/v1/pages/about');
    const values = res.body.data.stats.items.map((item: { value: string }) => item.value);

    const expectedYears = `${String(new Date().getUTCFullYear() - 1967)}+ Years`;
    expect(values[0]).toBe(expectedYears);
    expect(values[1]).toBe('3 Offices');
  });

  it('recomputes the office count when an office is unpublished', async () => {
    const { Office } = await import('../../../src/models/index.js');
    await Office.updateOne({ slug: 'ibadan' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/pages/about');

    expect(res.body.data.stats.items[1].value).toBe('2 Offices');
  });

  it('leaves a manual stat exactly as the firm typed it', async () => {
    const res = await request(app).get('/api/v1/pages/about');

    expect(res.body.data.stats.items[2].value).toBe('15+ Areas');
  });
});

describe('embedded collections', () => {
  it('orders the Home practice tabs by homeOrder, not the page order', async () => {
    const res = await request(app).get('/api/v1/pages/home');

    expect(res.body.data.practiceAreas.map((area: { shortLabel: string }) => area.shortLabel)).toEqual([
      'Corporate',
      'Data Privacy',
      'Energy',
      'Dispute Resolution',
      'Intellectual Property',
      'Real Estate',
      'Tax',
    ]);
  });

  it('embeds only the three leadership attorneys on Home', async () => {
    const res = await request(app).get('/api/v1/pages/home');

    expect(res.body.data.leadership).toHaveLength(3);
  });

  it('embeds the Managing Partner as a full summary on the About pull quote', async () => {
    const res = await request(app).get('/api/v1/pages/about');

    expect(res.body.data.story.quotePerson.displayName).toBe('Dr. Babatunde Ajibade, SAN');
  });

  it('serves the insights page with a null hero, as the design has it', async () => {
    const res = await request(app).get('/api/v1/pages/insights');

    expect(res.body.data.hero).toBeNull();
    expect(res.body.data.featured).toHaveLength(3);
  });
});

describe('preview', () => {
  it('excludes a draft practice area from the Home tabs', async () => {
    await PracticeArea.updateOne({ slug: 'tax' }, { status: 'draft' });

    const res = await request(app).get('/api/v1/pages/home');

    expect(res.body.data.practiceAreas).toHaveLength(6);
  });

  it('includes drafts with preview and a valid admin token', async () => {
    await Insight.updateMany({}, { status: 'draft' });

    const withoutPreview = await request(app).get('/api/v1/pages/home');
    const withPreview = await request(app)
      .get('/api/v1/pages/home?preview=true')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(withoutPreview.body.data.latestInsights).toHaveLength(0);
    expect(withPreview.body.data.latestInsights).toHaveLength(4);
    expectToMatchContract(withPreview, 'get', '/api/v1/pages/{key}');
  });
});
