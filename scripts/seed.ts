#!/usr/bin/env tsx
/**
 * Loads `fixtures/seed/*` into the database for development and staging.
 *
 * Idempotent by construction: everything is upserted by its natural key (slug,
 * or `key` for the singletons), never inserted. That matters more than it
 * sounds — creating instead of upserting would hand each re-run to the slug
 * collision logic and quietly produce `tax-2`, `tax-3`, and a site whose URLs
 * drift every time someone reseeds.
 *
 * Placeholder images become real Media records so dev and staging have
 * something to render. Production gets its copy from
 * `scripts/load-launch-content.ts` instead, with no images at all: the firm
 * uploads the real ones through the admin UI (ADR-011).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { Model, Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/core/db.js';
import { logger } from '../src/core/logger.js';
import { config } from '../src/config/env.js';
import { IMAGE_SIZES } from '../src/config/constants.js';
import { slugify } from '../src/helpers/slug.helper.js';
import {
  Award,
  Faq,
  Industry,
  Insight,
  Job,
  LegalPage,
  Media,
  Office,
  Page,
  Person,
  PracticeArea,
  RecognitionDirectory,
  Settings,
} from '../src/models/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = join(ROOT, 'fixtures', 'seed');

type Json = Record<string, unknown>;

/** The placeholder descriptor the fixtures carry in place of an image. */
interface Placeholder {
  placeholder: string;
  width: number;
  height: number;
  alt: string;
}

/** The descriptor for a placeholder PDF document (ADR-053). */
interface DocumentPlaceholder {
  placeholderDocument: string;
  title: string;
}

const isPlaceholder = (value: unknown): value is Placeholder =>
  typeof value === 'object' &&
  value !== null &&
  'placeholder' in value &&
  typeof (value as Placeholder).placeholder === 'string';

const isDocumentPlaceholder = (value: unknown): value is DocumentPlaceholder =>
  typeof value === 'object' &&
  value !== null &&
  'placeholderDocument' in value &&
  typeof (value as DocumentPlaceholder).placeholderDocument === 'string';

type AnyPlaceholder = Placeholder | DocumentPlaceholder;

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));

/** Seed files are checked-in fixtures, validated by the models on write. */
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

/** Stable identity for a placeholder, so re-running reuses the same Media doc. */
const storageKeyFor = (p: AnyPlaceholder): string =>
  'placeholderDocument' in p
    ? `seed/document-${slugify(p.placeholderDocument)}`
    : `seed/${slugify(p.placeholder)}-${String(p.width)}x${String(p.height)}`;

const placeholderUrl = (p: Placeholder, width: number): string => {
  const height = Math.round(width * (p.height / p.width));
  return `https://placehold.co/${String(width)}x${String(height)}?text=${encodeURIComponent(p.placeholder)}`;
};

/** Walk a value, collecting every placeholder descriptor it contains. */
function collectPlaceholders(value: unknown, found: Map<string, AnyPlaceholder>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, found);
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  if (isPlaceholder(value) || isDocumentPlaceholder(value)) {
    found.set(storageKeyFor(value), value);
    return;
  }
  for (const nested of Object.values(value)) collectPlaceholders(nested, found);
}

/** Replace placeholder descriptors with the id of their Media record. */
function resolvePlaceholders(value: unknown, media: Map<string, Types.ObjectId>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolvePlaceholders(item, media));
  if (typeof value !== 'object' || value === null) return value;

  if (isPlaceholder(value) || isDocumentPlaceholder(value)) {
    return media.get(storageKeyFor(value)) ?? null;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, resolvePlaceholders(nested, media)])
  );
}

/** Upsert by a natural key and return the resulting id. */
async function upsert<T>(
  model: Model<T>,
  filter: Record<string, unknown>,
  doc: Record<string, unknown>
): Promise<Types.ObjectId> {
  // upsert + new always yields a document, so there is no null branch to guard.
  const result = await model.findOneAndUpdate(
    filter,
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  return result._id as Types.ObjectId;
}

/** slug → id, for resolving the fixtures' slug references. */
type SlugMap = Map<string, Types.ObjectId>;

const toId = (map: SlugMap, slug: unknown): Types.ObjectId | null =>
  typeof slug === 'string' ? (map.get(slug) ?? null) : null;

const toIds = (map: SlugMap, slugs: unknown): Types.ObjectId[] =>
  Array.isArray(slugs)
    ? slugs.map((slug) => toId(map, slug)).filter((id): id is Types.ObjectId => id !== null)
    : [];

export interface SeedResult {
  readonly media: number;
  readonly practiceAreas: number;
  readonly people: number;
  readonly offices: number;
  readonly insights: number;
  readonly industries: number;
  readonly recognitionDirectories: number;
  readonly awards: number;
  readonly legalPages: number;
  readonly faqs: number;
  readonly jobs: number;
  readonly pages: number;
  readonly settings: number;
}

export interface SeedOptions {
  /**
   * Environment to check the production guard against. Injected rather than
   * read from the frozen config so the refusal itself is testable.
   */
  readonly nodeEnv?: string;
}

export async function runSeed(options: SeedOptions = {}): Promise<SeedResult> {
  const nodeEnv = options.nodeEnv ?? config.NODE_ENV;

  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to seed a production database. Use scripts/load-launch-content.ts, which ' +
        'creates draft content with no placeholder images.'
    );
  }

  const practiceAreaDocs = readDocs('practice-areas.json');
  const peopleDocs = readDocs('people.json');
  const officeDocs = readDocs('offices.json');
  // The pro bono demo repeats fill the paginated Responsible Business grid in
  // dev. They live in their own file so the launch loader never reads them.
  const insightDocs = [...readDocs('insights.json'), ...readDocs('insights.demo.json')];
  const industryDocs = readDocs('industries.json');
  const directoryDocs = readDocs('recognition-directories.json');
  const awardDocs = readDocs('awards.json');
  const legalDocs = readDocs('legal-pages.json');
  const faqDocs = readDocs('faqs.json');
  const jobDocs = readDocs('jobs.json');
  const pageDocs = readDocs('pages.json');
  const settingsDoc = readDoc('settings.json');

  // --- media first: everything else references it -------------------------
  const placeholders = new Map<string, AnyPlaceholder>();
  for (const source of [
    practiceAreaDocs,
    peopleDocs,
    officeDocs,
    insightDocs,
    directoryDocs,
    awardDocs,
    faqDocs,
    jobDocs,
    pageDocs,
    [settingsDoc],
  ]) {
    collectPlaceholders(source, placeholders);
  }

  const mediaIds = new Map<string, Types.ObjectId>();
  for (const [storageKey, placeholder] of placeholders) {
    if ('placeholderDocument' in placeholder) {
      // A PDF record whose URL is a placeholder picture: dev only, like the
      // images, and replaced by the firm's real file through the library.
      mediaIds.set(
        storageKey,
        await upsert(
          Media,
          { storageKey },
          {
            kind: 'document',
            provider: 'local',
            storageKey,
            url: `https://placehold.co/600x800?text=${encodeURIComponent(placeholder.placeholderDocument)}`,
            sizes: null,
            version: 1,
            width: null,
            height: null,
            mimeType: 'application/pdf',
            bytes: 1024,
            originalFilename: `${slugify(placeholder.placeholderDocument)}.pdf`,
            title: placeholder.title,
            alt: null,
            focalPoint: null,
          }
        )
      );
      continue;
    }

    const id = await upsert(
      Media,
      { storageKey },
      {
        kind: 'image',
        provider: 'local',
        storageKey,
        url: placeholderUrl(placeholder, placeholder.width),
        sizes: {
          sm: placeholderUrl(placeholder, IMAGE_SIZES.sm),
          md: placeholderUrl(placeholder, IMAGE_SIZES.md),
          lg: placeholderUrl(placeholder, IMAGE_SIZES.lg),
        },
        version: 1,
        width: placeholder.width,
        height: placeholder.height,
        mimeType: 'image/png',
        bytes: 1024,
        originalFilename: `${slugify(placeholder.placeholder)}.png`,
        title: placeholder.placeholder,
        alt: placeholder.alt,
        focalPoint: { x: 0.5, y: 0.5 },
      }
    );
    mediaIds.set(storageKey, id);
  }

  // --- collections without cross-references -------------------------------
  const officeIds: SlugMap = new Map();
  for (const doc of officeDocs) {
    const { slug, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    officeIds.set(String(slug), await upsert(Office, { slug }, { slug, ...rest }));
  }

  const industryIds: SlugMap = new Map();
  for (const doc of industryDocs) {
    const { slug, ...rest } = doc;
    industryIds.set(String(slug), await upsert(Industry, { slug }, { slug, ...rest }));
  }

  // Practice areas name their lead, and people name their practice areas, so
  // the lead is set in a second pass once the people exist.
  const practiceAreaIds: SlugMap = new Map();
  const leads = new Map<string, unknown>();
  for (const doc of practiceAreaDocs) {
    const { slug, lead, industries, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    leads.set(String(slug), lead);
    practiceAreaIds.set(
      String(slug),
      await upsert(
        PracticeArea,
        { slug },
        { slug, ...rest, industries: toIds(industryIds, industries) }
      )
    );
  }

  // --- people reference practice areas and offices ------------------------
  const peopleIds: SlugMap = new Map();
  for (const doc of peopleDocs) {
    const { slug, practiceAreas, primaryPracticeArea, office, ...rest } = resolvePlaceholders(
      doc,
      mediaIds
    ) as Json;
    peopleIds.set(
      String(slug),
      await upsert(
        Person,
        { slug },
        {
          slug,
          ...rest,
          primaryPracticeArea: toId(practiceAreaIds, primaryPracticeArea),
          practiceAreas: toIds(practiceAreaIds, practiceAreas),
          office: toId(officeIds, office),
        }
      )
    );
  }

  for (const [slug, lead] of leads) {
    await PracticeArea.updateOne({ slug }, { $set: { lead: toId(peopleIds, lead) } });
  }

  // --- insights reference people and practice areas -----------------------
  for (const doc of insightDocs) {
    const { slug, practiceAreas, author, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    await upsert(
      Insight,
      { slug },
      {
        slug,
        ...rest,
        practiceAreas: toIds(practiceAreaIds, practiceAreas),
        // Null is meaningful here: it means the firm is the author.
        author: toId(peopleIds, author),
      }
    );
  }

  const directoryIds: SlugMap = new Map();
  for (const doc of directoryDocs) {
    const { slug, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    directoryIds.set(String(slug), await upsert(RecognitionDirectory, { slug }, { slug, ...rest }));
  }

  for (const doc of awardDocs) {
    const { slug, directory, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    await upsert(Award, { slug }, { slug, ...rest, directory: toId(directoryIds, directory) });
  }

  for (const doc of faqDocs) {
    const { slug, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    await upsert(Faq, { slug }, { slug, ...rest });
  }

  for (const doc of jobDocs) {
    const { slug, practiceArea, office, ...rest } = resolvePlaceholders(doc, mediaIds) as Json;
    await upsert(
      Job,
      { slug },
      {
        slug,
        ...rest,
        practiceArea: toId(practiceAreaIds, practiceArea),
        office: toId(officeIds, office),
      }
    );
  }

  // --- singletons ---------------------------------------------------------
  for (const doc of pageDocs) {
    const resolved = resolvePlaceholders(doc, mediaIds) as Json;
    const { key, story, ...rest } = resolved;

    const sections: Json = { ...rest };
    if (story !== undefined && story !== null) {
      const { quotePerson, ...storyRest } = story as Json;
      sections.story = { ...storyRest, quotePerson: toId(peopleIds, quotePerson) };
    }

    await upsert(Page, { key }, { key, ...sections });
  }

  for (const doc of legalDocs) {
    const { key, ...rest } = doc;
    await upsert(LegalPage, { key }, { key, ...rest });
  }

  const { key: settingsKey, ...settingsRest } = resolvePlaceholders(settingsDoc, mediaIds) as Json;
  await upsert(
    Settings,
    { key: settingsKey ?? 'site' },
    { key: settingsKey ?? 'site', ...settingsRest }
  );

  return {
    media: await Media.countDocuments(),
    practiceAreas: await PracticeArea.countDocuments(),
    people: await Person.countDocuments(),
    offices: await Office.countDocuments(),
    insights: await Insight.countDocuments(),
    industries: await Industry.countDocuments(),
    recognitionDirectories: await RecognitionDirectory.countDocuments(),
    awards: await Award.countDocuments(),
    legalPages: await LegalPage.countDocuments(),
    faqs: await Faq.countDocuments(),
    jobs: await Job.countDocuments(),
    pages: await Page.countDocuments(),
    settings: await Settings.countDocuments(),
  };
}

/** Only run when invoked directly, so tests can import runSeed. */
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  connectDatabase()
    .then(() => runSeed())
    .then(async (result) => {
      logger.info(result, 'seed complete');
      await disconnectDatabase();
    })
    .catch((error: unknown) => {
      logger.fatal({ err: error }, 'seed failed');
      process.exit(1);
    });
}
