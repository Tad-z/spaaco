import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import { CONTENT_COLLECTIONS } from '../constants/content-collections.js';
import type { AdminCollection, ContentCollectionConfig } from '../constants/content-collections.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { invalidateEntity } from './cache.service.js';
import { record } from './audit.service.js';
import { assertMediaKinds } from './media.service.js';
import type { ErrorDetail } from '../types/api.js';
import type { UserRole } from '../constants/enums.js';

/**
 * One implementation of CRUD for all nine content collections.
 *
 * Everything that differs between them lives in
 * `constants/content-collections.ts`, so behaviour that must be identical —
 * optimistic locking, reference checks before delete, cache invalidation,
 * audit entries — is written once and cannot drift between collections.
 */

export interface ActorContext {
  readonly actorId?: Types.ObjectId;
  readonly roles?: readonly UserRole[];
}

export interface ListOptions {
  readonly status?: 'draft' | 'published';
  readonly q?: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * A stored document. The shape varies by collection, so only the fields this
 * layer actually needs are typed; `slug` among them, since every cache tag and
 * audit entry quotes it.
 */
export type ContentDoc = Record<string, unknown> & {
  _id: Types.ObjectId;
  revision: number;
  slug: string;
};

const config = (collection: AdminCollection): ContentCollectionConfig =>
  CONTENT_COLLECTIONS[collection];

const modelFor = (collection: AdminCollection): Model<unknown> =>
  mongoose.model(config(collection).model) as unknown as Model<unknown>;

/** Escape a user-supplied string before it becomes part of a regex. */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listContent(
  collection: AdminCollection,
  options: ListOptions
): Promise<{ items: ContentDoc[]; total: number }> {
  const filter: Record<string, unknown> = {};

  // Admin lists show every status by default: an editor looking for a draft
  // should not have to know to ask for it.
  if (options.status !== undefined) filter.status = options.status;

  if (options.q !== undefined && options.q !== '') {
    const pattern = new RegExp(escapeRegex(options.q), 'i');
    filter.$or = config(collection).searchFields.map((field) => ({ [field]: pattern }));
  }

  const model = modelFor(collection);

  const [items, total] = await Promise.all([
    model
      .find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<ContentDoc[]>(),
    model.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getContent(collection: AdminCollection, id: string): Promise<ContentDoc> {
  const doc = await modelFor(collection).findById(id).lean<ContentDoc | null>();
  if (!doc) throw new NotFoundError(config(collection).label);
  return doc;
}

interface LegacyImportInput {
  readonly source: string;
  readonly legacyId: number;
  readonly publishedAt?: string;
}

/**
 * Turns a write's `legacyImport` into the stored `legacy` block (ADR-059).
 *
 * Admins only. An import may backdate an insight's `publishedAt`, which no
 * other write can do, so it is refused outright from any other role rather
 * than ignored: an editor sending it has a client bug worth hearing about.
 * Returns the input unchanged when there is no `legacyImport`.
 */
function applyLegacyImport(
  input: Record<string, unknown>,
  context: ActorContext
): { input: Record<string, unknown>; legacy?: LegacyImportInput } {
  if (input.legacyImport === undefined) return { input };

  if (!(context.roles ?? []).includes('admin')) {
    throw new ForbiddenError('Only an administrator can import content', [
      { path: 'legacyImport', message: 'requires the admin role' },
    ]);
  }

  // Validated by the request schema before it reaches here.
  const { legacyImport, ...rest } = input;
  const legacy = legacyImport as LegacyImportInput;

  const output: Record<string, unknown> = {
    ...rest,
    legacy: { source: legacy.source, legacyId: legacy.legacyId, importedAt: new Date() },
  };
  if (legacy.publishedAt !== undefined) output.publishedAt = new Date(legacy.publishedAt);

  return { input: output, legacy };
}

export async function createContent(
  collection: AdminCollection,
  input: Record<string, unknown>,
  context: ActorContext = {}
): Promise<ContentDoc> {
  const model = modelFor(collection);
  await assertMediaKinds(config(collection).model, input);
  const { input: data, legacy } = applyLegacyImport(input, context);

  const created = await model.create({ ...data, createdBy: context.actorId ?? null });
  const doc = (created as unknown as { toObject: () => ContentDoc }).toObject();

  invalidateEntity(config(collection).cacheEntity, doc.slug);
  await record({
    actor: context.actorId ?? null,
    action: `${collection}.create`,
    entity: config(collection).model,
    entityId: doc._id,
    meta: legacy === undefined ? { slug: doc.slug } : { slug: doc.slug, legacyImport: legacy },
  });

  return doc;
}

/**
 * Update with optimistic locking.
 *
 * The revision is checked inside the same `findOneAndUpdate` that applies the
 * change, so two editors saving concurrently cannot both succeed: the second
 * matches nothing and gets a 409 carrying the current revision (ADR-015).
 */
export async function updateContent(
  collection: AdminCollection,
  id: string,
  expectedRevision: number,
  input: Record<string, unknown>,
  context: ActorContext = {}
): Promise<ContentDoc> {
  const model = modelFor(collection);
  await assertMediaKinds(config(collection).model, input);
  if (collection === 'insights') await assertOneArticleTarget(model, id, input);
  const { input: data, legacy } = applyLegacyImport(input, context);

  const updated = await model
    .findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      { $set: { ...data, updatedBy: context.actorId ?? null }, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    )
    .lean<ContentDoc | null>();

  if (updated) {
    invalidateEntity(config(collection).cacheEntity, updated.slug);
    // Ordinary edits are not audited, but an import can move `publishedAt`,
    // which is otherwise only ever set by the audited publish action.
    if (legacy !== undefined) {
      await record({
        actor: context.actorId ?? null,
        action: `${collection}.import`,
        entity: config(collection).model,
        entityId: updated._id,
        meta: { slug: updated.slug, legacyImport: legacy },
      });
    }
    return updated;
  }

  // Nothing matched: either the record is gone, or somebody else saved first.
  const current = await model.findById(id).lean<ContentDoc | null>();
  if (!current) throw new NotFoundError(config(collection).label);

  throw new ConflictError(
    'This record changed since you loaded it. Reload and reapply your changes.',
    [{ path: 'revision', message: `current revision is ${String(current.revision)}` }]
  );
}

/**
 * An article's "Read Article" link goes to one place (ADR-051). The request
 * schema catches both in one body; this catches a patch that sets one while
 * the stored record already has the other.
 */
async function assertOneArticleTarget(
  model: Model<unknown>,
  id: string,
  input: Record<string, unknown>
): Promise<void> {
  if (!input.externalUrl && !input.document) return;

  const current = await model
    .findById(id)
    .select('externalUrl document')
    .lean<{ externalUrl?: unknown; document?: unknown } | null>();
  if (!current) return;

  const merged = { ...current, ...input };
  if (merged.externalUrl && merged.document) {
    throw new ValidationError('An article links to an external URL or a document, not both', [
      { path: 'document', message: 'set either externalUrl or document, not both' },
    ]);
  }
}

export async function setPublished(
  collection: AdminCollection,
  id: string,
  published: boolean,
  context: ActorContext = {}
): Promise<ContentDoc> {
  const model = modelFor(collection);
  const existing = await model.findById(id).lean<ContentDoc | null>();
  if (!existing) throw new NotFoundError(config(collection).label);

  const update: Record<string, unknown> = {
    status: published ? 'published' : 'draft',
    updatedBy: context.actorId ?? null,
  };

  // Stamped once, on first publish, so republishing keeps the original date.
  if (published && (existing.publishedAt === null || existing.publishedAt === undefined)) {
    update.publishedAt = new Date();
  }

  const updated = await model
    .findOneAndUpdate({ _id: id }, { $set: update, $inc: { revision: 1 } }, { new: true })
    .lean<ContentDoc | null>();

  if (!updated) throw new NotFoundError(config(collection).label);

  invalidateEntity(config(collection).cacheEntity, updated.slug);
  await record({
    actor: context.actorId ?? null,
    action: `${collection}.${published ? 'publish' : 'unpublish'}`,
    entity: config(collection).model,
    entityId: updated._id,
    meta: { slug: updated.slug },
  });

  return updated;
}

/** Everything still pointing at this record, so a delete cannot orphan a page. */
export async function findReferences(
  collection: AdminCollection,
  id: string
): Promise<ErrorDetail[]> {
  const entries = config(collection).referencedBy;
  if (entries.length === 0) return [];

  const found = await Promise.all(
    entries.map(async (entry) => {
      const referencing = await mongoose
        .model(entry.model)
        .find({ [entry.path]: id })
        .select(entry.label)
        .limit(20)
        .lean<Record<string, unknown>[]>();

      return referencing.map((doc) => ({
        path: `${entry.model}.${entry.path}`,
        message: String(doc[entry.label] ?? doc._id),
      }));
    })
  );

  return found.flat();
}

export async function deleteContent(
  collection: AdminCollection,
  id: string,
  context: ActorContext = {}
): Promise<void> {
  const model = modelFor(collection);
  const existing = await model.findById(id).lean<ContentDoc | null>();
  if (!existing) throw new NotFoundError(config(collection).label);

  const references = await findReferences(collection, id);
  if (references.length > 0) {
    throw new ConflictError(
      'This record is still referenced elsewhere. Remove those references first.',
      references
    );
  }

  await model.deleteOne({ _id: id });

  invalidateEntity(config(collection).cacheEntity, existing.slug);
  await record({
    actor: context.actorId ?? null,
    action: `${collection}.delete`,
    entity: config(collection).model,
    entityId: existing._id,
    meta: { slug: existing.slug },
  });
}

/** Set `order` from each id's position. Ids not listed keep their order. */
export async function reorderContent(
  collection: AdminCollection,
  ids: string[],
  context: ActorContext = {}
): Promise<void> {
  const model = modelFor(collection);

  const found = await model
    .find({ _id: { $in: ids } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  if (found.length !== ids.length) {
    throw new NotFoundError(`One or more ${config(collection).label.toLowerCase()} records`);
  }

  await model.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    }))
  );

  invalidateEntity(config(collection).cacheEntity);
  await record({
    actor: context.actorId ?? null,
    action: `${collection}.reorder`,
    entity: config(collection).model,
    meta: { count: ids.length },
  });
}
