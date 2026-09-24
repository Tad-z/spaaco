#!/usr/bin/env tsx
/**
 * Loads the firm's website copy into an empty database, once, at launch.
 *
 * The copy in `fixtures/seed/` was transcribed from the designs. Without this,
 * somebody at the firm retypes forty pages of text that already exists, and
 * introduces a different set of typos than the designs have.
 *
 * Three rules make it safe to hand to somebody who has not read the code.
 *
 * It **refuses a database that already has content**, so it cannot overwrite a
 * week of the firm's edits — there is no `--force`, because the recovery from
 * getting that wrong is a database restore.
 *
 * It creates **everything as a draft**. The firm reviews each item, uploads the
 * real photographs, and publishes deliberately. Nothing appears on the public
 * site because a script ran.
 *
 * It creates **no images**. `scripts/seed.ts` invents placehold.co pictures,
 * which is right for development and wrong here: a placeholder that reaches
 * production is a placeholder somebody has to notice. Image fields are left
 * empty, and the dashboard shows them as the gaps they are.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Model, Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/core/db.js';
import { logger } from '../src/core/logger.js';
import {
  Faq,
  Insight,
  Job,
  Office,
  Page,
  Person,
  PracticeArea,
  Recognition,
  Settings,
} from '../src/models/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = join(ROOT, 'fixtures', 'seed');

type Json = Record<string, unknown>;
type SlugMap = Map<string, Types.ObjectId>;

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));

const readDocs = (file: string): Json[] => {
  const parsed = readJson(file);
  if (!Array.isArray(parsed)) throw new Error(`${file} should contain an array`);

  return parsed as Json[];
};

const readDoc = (file: string): Json => {
  const parsed = readJson(file);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} should contain an object`);
  }

  return parsed as Json;
};

/**
 * Strip every placeholder image descriptor, leaving the field null.
 *
 * The fixtures describe images as `{ placeholder, width, height, alt }`. The
 * dev seed turns those into real Media records pointing at placehold.co; here
 * they become nothing at all, so the firm sees an empty image slot rather than
 * a grey rectangle that looks deliberate.
 */
function withoutImages(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutImages);
  if (typeof value !== 'object' || value === null) return value;

  if ('placeholder' in value) return null;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, withoutImages(nested)])
  );
}

const asJson = (value: unknown): Json => withoutImages(value) as Json;

/** Every content collection, and whether it holds anything. */
const COLLECTIONS: readonly { name: string; model: Model<never> }[] = [
  { name: 'practice areas', model: PracticeArea as unknown as Model<never> },
  { name: 'people', model: Person as unknown as Model<never> },
  { name: 'offices', model: Office as unknown as Model<never> },
  { name: 'insights', model: Insight as unknown as Model<never> },
  { name: 'recognitions', model: Recognition as unknown as Model<never> },
  { name: 'FAQs', model: Faq as unknown as Model<never> },
  { name: 'jobs', model: Job as unknown as Model<never> },
  { name: 'pages', model: Page as unknown as Model<never> },
  { name: 'settings', model: Settings as unknown as Model<never> },
];

/** What is already there, so the refusal can say what it found. */
export async function existingContent(): Promise<string[]> {
  const counts = await Promise.all(
    COLLECTIONS.map(async ({ name, model }) => ({ name, count: await model.countDocuments() }))
  );

  return counts
    .filter(({ count }) => count > 0)
    .map(({ name, count }) => `${String(count)} ${name}`);
}

export interface LoadResult {
  readonly practiceAreas: number;
  readonly people: number;
  readonly offices: number;
  readonly insights: number;
  readonly recognitions: number;
  readonly faqs: number;
  readonly jobs: number;
  readonly pages: number;
  readonly settings: number;
}

const toId = (map: SlugMap, slug: unknown): Types.ObjectId | null =>
  typeof slug === 'string' ? (map.get(slug) ?? null) : null;

const toIds = (map: SlugMap, slugs: unknown): Types.ObjectId[] =>
  Array.isArray(slugs)
    ? slugs.map((slug) => toId(map, slug)).filter((id): id is Types.ObjectId => id !== null)
    : [];

/**
 * Load the copy. The caller has already checked the database is empty.
 *
 * Exported so the refusal and the draft rule can be tested without a CLI.
 */
export async function loadLaunchContent(): Promise<LoadResult> {
  const draft = { status: 'draft' as const, publishedAt: null };

  // Offices and practice areas first: people, jobs and insights point at them.
  const officeIds: SlugMap = new Map();
  for (const doc of readDocs('offices.json')) {
    const { slug, ...rest } = asJson(doc);
    const created = await Office.create({ ...rest, slug, ...draft });
    officeIds.set(String(slug), created._id);
  }

  const practiceAreaIds: SlugMap = new Map();
  for (const doc of readDocs('practice-areas.json')) {
    // `contacts` is dropped: it points at people, who do not exist yet, and
    // the firm reassigns contacts during review anyway.
    const { slug, contacts: _contacts, ...rest } = asJson(doc);
    const created = await PracticeArea.create({ ...rest, slug, ...draft });
    practiceAreaIds.set(String(slug), created._id);
  }

  const peopleIds: SlugMap = new Map();
  for (const doc of readDocs('people.json')) {
    const { slug, practiceAreas, office, ...rest } = asJson(doc);
    const created = await Person.create({
      ...rest,
      slug,
      practiceAreas: toIds(practiceAreaIds, practiceAreas),
      office: toId(officeIds, office),
      ...draft,
    });
    peopleIds.set(String(slug), created._id);
  }

  for (const doc of readDocs('insights.json')) {
    const { slug, practiceAreas, author, ...rest } = asJson(doc);
    await Insight.create({
      ...rest,
      slug,
      practiceAreas: toIds(practiceAreaIds, practiceAreas),
      // Null is meaningful: it means the firm wrote it.
      author: toId(peopleIds, author),
      ...draft,
    });
  }

  for (const doc of readDocs('recognitions.json')) {
    const { slug, ...rest } = asJson(doc);
    await Recognition.create({ ...rest, slug, ...draft });
  }

  for (const doc of readDocs('faqs.json')) {
    const { slug, ...rest } = asJson(doc);
    await Faq.create({ ...rest, slug, ...draft });
  }

  for (const doc of readDocs('jobs.json')) {
    const { slug, practiceArea, office, ...rest } = asJson(doc);
    await Job.create({
      ...rest,
      slug,
      practiceArea: toId(practiceAreaIds, practiceArea),
      office: toId(officeIds, office),
      // A vacancy the firm has not reviewed must not be open to applications.
      isOpen: false,
      ...draft,
    });
  }

  // Pages and settings are singletons with no publish state: they exist or the
  // site has no shell. Their *content* is still reviewed before anyone sees it,
  // because every collection above is draft.
  for (const doc of readDocs('pages.json')) {
    const { key, story, ...rest } = asJson(doc);
    const sections: Json = { ...rest };

    if (story !== undefined && story !== null) {
      const { quotePerson, ...storyRest } = story as Json;
      sections.story = { ...storyRest, quotePerson: toId(peopleIds, quotePerson) };
    }

    await Page.create({ key, ...sections });
  }

  const { key: settingsKey, ...settingsRest } = asJson(readDoc('settings.json'));
  await Settings.create({ ...settingsRest, key: settingsKey ?? 'site' });

  return {
    practiceAreas: await PracticeArea.countDocuments(),
    people: await Person.countDocuments(),
    offices: await Office.countDocuments(),
    insights: await Insight.countDocuments(),
    recognitions: await Recognition.countDocuments(),
    faqs: await Faq.countDocuments(),
    jobs: await Job.countDocuments(),
    pages: await Page.countDocuments(),
    settings: await Settings.countDocuments(),
  };
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm')) {
    logger.error(
      "This writes the firm's launch copy into the database this environment points at. " +
        'Re-run with --confirm once you are sure that is the right database.'
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const existing = await existingContent();

    if (existing.length > 0) {
      // No --force. Getting this wrong means restoring a backup, and a flag
      // that exists is a flag somebody will reach for at 2am.
      logger.error(
        { found: existing },
        'This database already has content, so nothing was written. ' +
          'The loader only ever runs once, into an empty database.'
      );
      process.exitCode = 1;
      return;
    }

    const result = await loadLaunchContent();

    logger.info(result, 'launch content loaded as drafts, with no images');
    logger.info(
      'Next: sign in to the dashboard, review each item, upload the real ' +
        'photographs, and publish what is ready.'
    );
  } finally {
    await disconnectDatabase();
  }
}

/** Only run when invoked directly, so the tests can import the functions. */
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
) {
  await main();
}
