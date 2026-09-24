import type { FilterQuery, Model } from 'mongoose';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { zodIssueDetails } from '../helpers/zod-issues.helper.js';
import { toPlainJson } from '../helpers/plain.helper.js';
import { invalidateEntity } from './cache.service.js';
import { Page, Settings } from '../models/index.js';
import { schemaForPage } from '../validators/pages/index.js';
import { settingsWriteSchema } from '../validators/settings.validator.js';
import type { CacheEntity } from '../constants/cache-tags.js';
import type { PageKey } from '../types/api.js';

/**
 * The eight page documents and site settings share one implementation.
 *
 * All nine are a single document with a `revision`, replaced whole by PUT and
 * merged section by section by PATCH. The part worth getting right — validate
 * the *result* of the merge, then save only if nobody else saved first — is
 * identical for every one of them, so it exists once here and the differences
 * live in a config (ADR-015).
 *
 * Neither singleton records who last edited it: unlike the content
 * collections, the page and settings documents have no `updatedBy` field, and
 * both schemas are `strict: 'throw'`, so writing one would fail every save.
 */

export type SingletonDoc = Record<string, unknown> & { revision: number };

export interface SingletonConfig {
  /** The document this singleton lives in. */
  readonly model: Model<unknown>;
  /** Selects the one document; `{ key: 'home' }` or `{ key: 'site' }`. */
  readonly filter: FilterQuery<unknown>;
  /** What the *whole* document must satisfy after a write. */
  readonly schema: ZodTypeAny;
  readonly entity: CacheEntity;
  /** Cache key for `tagsFor`, when the entity has per-item tags. */
  readonly cacheKey?: string;
  /** Used in the 404 message. */
  readonly label: string;
}

export const pageConfig = (key: PageKey): SingletonConfig => ({
  model: Page as unknown as Model<unknown>,
  filter: { key },
  schema: schemaForPage(key),
  entity: 'page',
  cacheKey: key,
  label: `Page "${key}"`,
});

export const settingsConfig = (): SingletonConfig => ({
  model: Settings as unknown as Model<unknown>,
  filter: { key: 'site' },
  schema: settingsWriteSchema,
  entity: 'settings',
  label: 'Site settings',
});

/** Fields the server owns, kept on a read and never accepted on a write. */
const META = new Set(['_id', 'key', 'revision', 'createdAt', 'updatedAt']);

/**
 * The sections this singleton actually has, taken from its Zod schema.
 *
 * Every page document declares *every* page's sections, defaulting the ones it
 * does not use to null, so a raw read of the Home page also carries `story`,
 * `stats` and the rest as nulls. Handing those back would make the admin GET
 * body invalid as a PUT body — the schema is `strict()` — which is exactly the
 * round-trip guarantee in docs/API.md. The schema is already the list of what
 * belongs to a key, so it is the list used here.
 */
function sectionNames(schema: ZodTypeAny): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape === undefined ? [] : Object.keys(shape);
}

/**
 * Meta plus this key's sections, and nothing else, as plain JSON values.
 *
 * The conversion matters as much as the filtering: a merged section still
 * holding `lean()`'s ObjectIds would fail its own schema, which expects the id
 * strings the dashboard sends.
 */
function narrow(config: SingletonConfig, doc: SingletonDoc): SingletonDoc {
  const sections = new Set(sectionNames(config.schema));

  const kept = Object.fromEntries(
    Object.entries(doc).filter(([field]) => META.has(field) || sections.has(field))
  );

  return toPlainJson(kept) as SingletonDoc;
}

export async function getSingleton(config: SingletonConfig): Promise<SingletonDoc> {
  const doc = await config.model.findOne(config.filter).lean<SingletonDoc | null>();
  if (!doc) throw new NotFoundError(config.label);

  return narrow(config, doc);
}

/** The editable half of a stored document: what a PUT body is compared against. */
function editablePart(doc: SingletonDoc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([field]) => !META.has(field)));
}

/**
 * Validate the whole document, turning a Zod failure into a 400 whose paths
 * point at the offending section.
 */
function validated(config: SingletonConfig, candidate: unknown): Record<string, unknown> {
  try {
    return config.schema.parse(candidate) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError('The document is not valid for this key', zodIssueDetails(error));
    }
    throw error;
  }
}

/**
 * Save it, but only over the revision the editor actually read.
 *
 * The revision check is part of the same `findOneAndUpdate` as the change, so
 * two concurrent saves cannot both believe they won.
 */
async function save(
  config: SingletonConfig,
  expectedRevision: number,
  next: Record<string, unknown>
): Promise<SingletonDoc> {
  const updated = await config.model
    .findOneAndUpdate(
      { ...config.filter, revision: expectedRevision } as FilterQuery<unknown>,
      // No `updatedBy`: neither singleton carries one, and the models are
      // `strict: 'throw'`, so inventing the field here would fail every save.
      { $set: next, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    )
    .lean<SingletonDoc | null>();

  if (updated) {
    invalidateEntity(config.entity, config.cacheKey);
    return narrow(config, updated);
  }

  // Nothing matched: either it is gone, or somebody else saved first.
  const current = await config.model.findOne(config.filter).lean<SingletonDoc | null>();
  if (!current) throw new NotFoundError(config.label);

  throw new ConflictError(
    'This record changed since you loaded it. Reload and reapply your changes.',
    [{ path: 'revision', message: `current revision is ${String(current.revision)}` }]
  );
}

/** PUT: the body is the whole document. */
export async function replaceSingleton(
  config: SingletonConfig,
  expectedRevision: number,
  input: Record<string, unknown>
): Promise<SingletonDoc> {
  // Read first so a PUT to a key that has no document 404s rather than
  // failing later on the revision check with a misleading 409.
  await getSingleton(config);

  return save(config, expectedRevision, validated(config, input));
}

/**
 * PATCH: each top-level key replaces that section entirely.
 *
 * A shallow merge on purpose. Deep-merging would make it impossible to remove
 * an item from an array or clear a nested field, and an editor who sends three
 * stats means three, not "three added to the five already there" (docs/API.md).
 */
export async function patchSingleton(
  config: SingletonConfig,
  expectedRevision: number,
  patch: Record<string, unknown>
): Promise<SingletonDoc> {
  const current = await getSingleton(config);
  const merged = { ...editablePart(current), ...patch };

  // Validating the merged result, not the patch, is what stops a section-level
  // edit leaving the page in a shape the composers cannot render.
  const next = validated(config, merged);

  return save(config, expectedRevision, next);
}
