import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '../support/setup-db.js';
import { runSeed } from '../../scripts/seed.js';
import { Insight, Media, Page, Person, PracticeArea, Settings } from '../../src/models/index.js';

/**
 * The seed runs repeatedly — every developer, every staging deploy — so the
 * property that matters is that running it twice is the same as running it
 * once. The specific trap is slug collision: a seed that created instead of
 * upserting would hand each re-run to the collision logic and silently produce
 * tax-2, tax-3, changing the site's URLs every time someone reseeded.
 */

setupTestDb();

beforeAll(async () => {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
});

describe('the production guard', () => {
  it('refuses to seed a production database', async () => {
    await expect(runSeed({ nodeEnv: 'production' })).rejects.toThrow(
      /Refusing to seed a production database/
    );
  });

  it('writes nothing when it refuses', async () => {
    await expect(runSeed({ nodeEnv: 'production' })).rejects.toThrow();

    expect(await PracticeArea.countDocuments()).toBe(0);
    expect(await Media.countDocuments()).toBe(0);
  });

  it('still runs for staging, which does want seed data', async () => {
    const result = await runSeed({ nodeEnv: 'staging' });

    expect(result.practiceAreas).toBe(9);
  });
});

describe('runSeed', () => {
  it('loads every collection from the fixtures', async () => {
    const result = await runSeed();

    expect(result).toMatchObject({
      practiceAreas: 9,
      people: 9,
      offices: 3,
      // Four articles, the pro bono story and its eleven demo repeats.
      insights: 16,
      industries: 21,
      recognitionDirectories: 4,
      awards: 6,
      legalPages: 2,
      faqs: 5,
      jobs: 2,
      pages: 10,
      settings: 1,
    });
    expect(result.media).toBeGreaterThan(0);
  });

  it('is idempotent: running twice leaves the same counts', async () => {
    const first = await runSeed();
    const second = await runSeed();

    expect(second).toEqual(first);
  });

  it('keeps the same documents rather than replacing them', async () => {
    await runSeed();
    const before = await PracticeArea.findOne({ slug: 'tax' }).lean();

    await runSeed();
    const after = await PracticeArea.findOne({ slug: 'tax' }).lean();

    expect(after?._id.toString()).toBe(before?._id.toString());
  });

  it('does not accumulate suffixed slugs on a re-run', async () => {
    await runSeed();
    await runSeed();

    const suffixed = await PracticeArea.find({ slug: /-\d+$/ }).lean();

    expect(suffixed).toEqual([]);
  });

  it('resolves slug references into real object ids', async () => {
    await runSeed();

    const insight = await Insight.findOne({ slug: /trade-secrets$/ }).lean();
    const author = await Person.findOne({ slug: 'john-onyido' }).lean();

    expect(insight?.author?.toString()).toBe(author?._id.toString());
    expect(insight?.practiceAreas).toHaveLength(1);
  });

  it('leaves a firm-authored insight with a null author, which is meaningful', async () => {
    await runSeed();

    const insight = await Insight.findOne({ slug: /supreme-court-practice-directions$/ }).lean();

    expect(insight?.author).toBeNull();
  });

  it('creates media records for the placeholder images and attaches them', async () => {
    await runSeed();

    const practiceArea = await PracticeArea.findOne({ slug: 'tax' }).lean();
    expect(practiceArea?.image).toBeTruthy();

    const image = await Media.findById(practiceArea?.image).lean();
    expect(image?.url).toContain('placehold.co');
    expect(image?.alt).toBeTruthy();
  });

  it('reuses the same media record on a re-run rather than duplicating it', async () => {
    const first = await runSeed();
    const second = await runSeed();

    expect(second.media).toBe(first.media);
  });

  it('resolves a page reference to a person', async () => {
    await runSeed();

    const about = await Page.findOne({ key: 'about' }).lean();
    const mp = await Person.findOne({ slug: 'babatunde-ajibade' }).lean();

    expect(about?.story?.quotePerson?.toString()).toBe(mp?._id.toString());
  });

  it('seeds the insights page with a null hero, as the design has it', async () => {
    await runSeed();

    const insights = await Page.findOne({ key: 'insights' }).lean();

    expect(insights?.hero).toBeNull();
  });

  it('seeds exactly one settings document', async () => {
    await runSeed();
    await runSeed();

    expect(await Settings.countDocuments()).toBe(1);
  });

  it('seeds the real copy from the designs, not placeholders', async () => {
    await runSeed();

    const settings = await Settings.findOne({ key: 'site' }).lean();

    expect(settings?.firmName).toBe('SPA Ajibade & Co.');
    expect(settings?.foundedYear).toBe(1967);
  });
});
