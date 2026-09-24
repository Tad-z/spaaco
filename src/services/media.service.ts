import mongoose from 'mongoose';
import type { Model, SortOrder, Types } from 'mongoose';
import sharp from 'sharp';
import { MEDIA_REFS, MEDIA_REF_MODELS, mediaRefsFor } from '../constants/media-refs.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { ConflictError, NotFoundError, UnsupportedMediaTypeError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { sniffImageType } from '../helpers/image-type.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { Media } from '../models/index.js';
import { publicStorage } from '../integrations/storage/public/index.js';
import { invalidate } from './cache.service.js';
import { record } from './audit.service.js';
import { tagsFor } from '../constants/cache-tags.js';
import type { CacheEntity } from '../constants/cache-tags.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { StoredImage } from '../interfaces/integrations/storage.interface.js';

/**
 * The image library.
 *
 * Two rules shape everything here. A file is whatever its bytes say it is, not
 * whatever its name or `Content-Type` claims (ADR-016). And "where is this
 * image used?" is computed from `constants/media-refs.ts` on demand rather
 * than stored as back-references, so nothing has to be kept in sync on every
 * write — at the price of the registry itself having to be complete (ADR-013).
 */

export type MediaDoc = IMedia & { _id: Types.ObjectId };

export interface MediaUsage {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
  readonly field: string;
}

export interface ListMediaOptions {
  readonly q?: string;
  readonly unused?: boolean;
  readonly sort: 'newest' | 'oldest';
  readonly page: number;
  readonly pageSize: number;
}

export interface UploadInput {
  readonly buffer: Buffer;
  readonly originalFilename: string;
  readonly alt: string;
  readonly title?: string | null;
}

export interface ActorContext {
  readonly actorId?: Types.ObjectId;
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The accepted type, or a 415.
 *
 * Both the declared type and the real one must be acceptable: a mismatch means
 * somebody is lying about one of them, and the honest cases are covered by the
 * sniff alone.
 */
type AcceptedImageType = (typeof UPLOAD_LIMITS.imageMimeTypes)[number];

const isAccepted = (value: string): value is AcceptedImageType =>
  (UPLOAD_LIMITS.imageMimeTypes as readonly string[]).includes(value);

function acceptedType(buffer: Buffer): AcceptedImageType {
  const actual = sniffImageType(buffer);

  if (actual === undefined || !isAccepted(actual)) {
    throw new UnsupportedMediaTypeError(
      'Upload a JPEG, PNG, WebP or AVIF image. SVG is not accepted, because it can carry scripts.'
    );
  }

  return actual;
}

/** Store the bytes and read their dimensions, which no driver owns. */
async function storeImage(
  buffer: Buffer,
  originalFilename: string
): Promise<{
  stored: StoredImage;
  mimeType: AcceptedImageType;
  width: number;
  height: number;
}> {
  const mimeType = acceptedType(buffer);
  const metadata = await sharp(buffer).metadata();

  const stored = await publicStorage().put({ buffer, mimeType, originalFilename });

  return {
    stored,
    mimeType,
    width: metadata.width,
    height: metadata.height,
  };
}

export async function uploadMedia(
  input: UploadInput,
  context: ActorContext = {}
): Promise<MediaDoc> {
  const { stored, mimeType, width, height } = await storeImage(
    input.buffer,
    input.originalFilename
  );

  const created = await Media.create({
    kind: 'image',
    provider: publicStorage().name === 'cloudinary' ? 'cloudinary' : 'local',
    storageKey: stored.storageKey,
    url: stored.url,
    sizes: stored.sizes,
    version: 1,
    width,
    height,
    mimeType,
    bytes: input.buffer.byteLength,
    originalFilename: input.originalFilename,
    title: input.title ?? null,
    alt: input.alt,
    uploadedBy: context.actorId ?? null,
  });

  return created.toObject();
}

export async function listMedia(
  options: ListMediaOptions
): Promise<{ items: MediaDoc[]; total: number }> {
  const filter: Record<string, unknown> = {};

  if (options.q !== undefined && options.q !== '') {
    const pattern = new RegExp(escapeRegex(options.q), 'i');
    filter.$or = [{ title: pattern }, { alt: pattern }, { originalFilename: pattern }];
  }

  if (options.unused === true) {
    const used = await usedMediaIds();
    filter._id = { $nin: used };
  }

  const direction: SortOrder = options.sort === 'oldest' ? 1 : -1;
  // `_id` breaks ties, so a page boundary cannot show the same record twice.
  const sort: Record<string, SortOrder> = { createdAt: direction, _id: -1 };

  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort(sort)
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<MediaDoc[]>(),
    Media.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getMedia(id: string): Promise<MediaDoc> {
  const doc = await Media.findById(id).lean<MediaDoc | null>();
  if (!doc) throw new NotFoundError('Image');

  return doc;
}

export interface UpdateMediaInput {
  readonly alt?: string;
  readonly title?: string | null;
  readonly focalPoint?: { x: number; y: number };
}

export async function updateMedia(id: string, input: UpdateMediaInput): Promise<MediaDoc> {
  const updated = await Media.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true }
  ).lean<MediaDoc | null>();

  if (!updated) throw new NotFoundError('Image');

  // Alt text and focal point are rendered into every page using the image.
  await invalidateUsages(id);

  return updated;
}

/**
 * Swap the bytes, keep the id.
 *
 * The order matters: store the new file first, point the record at it, and
 * only then delete the old one. A failure at any step leaves a record whose
 * file exists, which is recoverable; the reverse would leave a live page
 * pointing at nothing.
 */
export async function replaceMediaFile(
  id: string,
  buffer: Buffer,
  originalFilename: string,
  context: ActorContext = {}
): Promise<MediaDoc> {
  const existing = await getMedia(id);
  const { stored, mimeType, width, height } = await storeImage(buffer, originalFilename);

  const updated = await Media.findByIdAndUpdate(
    id,
    {
      $set: {
        provider: publicStorage().name === 'cloudinary' ? 'cloudinary' : 'local',
        storageKey: stored.storageKey,
        // A new URL on purpose, so no browser or CDN can keep serving the old
        // picture from a cached copy of the same address.
        url: stored.url,
        sizes: stored.sizes,
        width,
        height,
        mimeType,
        bytes: buffer.byteLength,
        originalFilename,
      },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true }
  ).lean<MediaDoc | null>();

  if (!updated) throw new NotFoundError('Image');

  await removeStored(existing.storageKey);
  await invalidateUsages(id);

  await record({
    action: 'media.replace',
    entity: 'media',
    entityId: existing._id,
    actor: context.actorId ?? null,
    // The alt text describes the picture, not a person, so it is safe to keep.
    meta: { alt: existing.alt, version: updated.version },
  });

  return updated;
}

export async function deleteMedia(id: string, context: ActorContext = {}): Promise<void> {
  const existing = await getMedia(id);
  const usages = await findUsages(id);

  if (usages.length > 0) {
    throw new ConflictError(
      'This image is still in use. Remove it from the records below before deleting it.',
      usages.map((usage) => ({
        path: 'usedBy',
        message: `${usage.collection}: ${usage.label} (${usage.field})`,
      }))
    );
  }

  await Media.deleteOne({ _id: id });
  await removeStored(existing.storageKey);

  await record({
    action: 'media.delete',
    entity: 'media',
    entityId: existing._id,
    actor: context.actorId ?? null,
    meta: { alt: existing.alt },
  });
}

/**
 * Every record pointing at this image, from the registry.
 *
 * One query per referencing model, `$or`-ing that model's media fields, rather
 * than one per field — eight models and twelve fields would otherwise be
 * twelve round trips for a page the editor opens constantly.
 */
export async function findUsages(id: string): Promise<MediaUsage[]> {
  const objectId = new mongoose.Types.ObjectId(id);

  const perModel = await Promise.all(
    MEDIA_REF_MODELS.map(async (modelName) => {
      const refs = mediaRefsFor(modelName);
      const model = mongoose.model(modelName) as unknown as Model<unknown>;

      const labels = [...new Set(refs.map((ref) => ref.label))];

      const docs = await model
        .find({ $or: refs.map((ref) => ({ [ref.path]: objectId })) })
        .select([...refs.map((ref) => ref.path), ...labels].join(' '))
        .lean<Record<string, unknown>[]>();

      return docs.flatMap((doc) =>
        refs
          .filter((ref) => idOf(atPath(doc, ref.path)) === id)
          .map((ref) => ({
            collection: ref.collection,
            id: idOf(doc._id),
            label: labelOf(doc[ref.label]),
            field: ref.path,
          }))
      );
    })
  );

  return perModel.flat();
}

/** A reference as a hex string, whatever form it arrived in. */
const idOf = (value: unknown): string => {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  return typeof value === 'string' ? value : '';
};

/** A label is shown to a person, so anything but a string is not one. */
const labelOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Follow a dotted path into a lean document. */
function atPath(doc: Record<string, unknown>, path: string): unknown {
  let current: unknown = doc;

  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/** Ids referenced anywhere, for the `unused=true` filter. */
async function usedMediaIds(): Promise<Types.ObjectId[]> {
  const perModel = await Promise.all(
    MEDIA_REF_MODELS.map(async (modelName) => {
      const refs = mediaRefsFor(modelName);
      const model = mongoose.model(modelName) as unknown as Model<unknown>;

      const docs = await model
        .find({ $or: refs.map((ref) => ({ [ref.path]: { $ne: null } })) })
        .select(refs.map((ref) => ref.path).join(' '))
        .lean<Record<string, unknown>[]>();

      return docs.flatMap((doc) =>
        refs
          .map((ref) => atPath(doc, ref.path))
          .filter((value): value is Types.ObjectId => value instanceof mongoose.Types.ObjectId)
      );
    })
  );

  return perModel.flat();
}

/** Which cache entity each referencing collection belongs to. */
const ENTITY_BY_COLLECTION: Record<string, CacheEntity> = {
  practiceAreas: 'practiceArea',
  people: 'person',
  insights: 'insight',
  recognitions: 'recognition',
  pages: 'page',
};

/**
 * Clear the caches of everything showing this image.
 *
 * Without this, replacing a picture changes the URL in the database while
 * every cached page keeps rendering the old one.
 */
async function invalidateUsages(id: string): Promise<void> {
  const usages = await findUsages(id);

  const tags = new Set<string>();
  for (const usage of usages) {
    const entity = ENTITY_BY_COLLECTION[usage.collection];
    if (entity === undefined) continue;

    // Pages are keyed by their page key, which is the label the registry picks.
    for (const tag of tagsFor(entity, usage.label)) tags.add(tag);
  }

  if (tags.size > 0) invalidate([...tags]);
}

/** Storage failures are logged, never fatal: the record is already correct. */
async function removeStored(storageKey: string): Promise<void> {
  try {
    await publicStorage().remove(storageKey);
  } catch (error) {
    logger.warn({ err: error, storageKey }, 'could not remove the stored file');
  }
}

/** Exported for the registry guard test, which asserts nothing is missing. */
export const REGISTERED_MEDIA_PATHS = MEDIA_REFS.map((ref) => `${ref.model}.${ref.path}`);
