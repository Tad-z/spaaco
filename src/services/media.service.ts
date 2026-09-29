import mongoose from 'mongoose';
import type { Model, SortOrder, Types } from 'mongoose';
import sharp from 'sharp';
import { MEDIA_REFS, MEDIA_REF_MODELS, mediaRefsFor } from '../constants/media-refs.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import {
  ConflictError,
  FileRejectedError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../core/errors.js';
import { logger } from '../core/logger.js';
import { sniffImageType } from '../helpers/image-type.helper.js';
import { PDF_MIME, sniffDocumentType } from '../helpers/document-type.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { Media } from '../models/index.js';
import { publicStorage } from '../integrations/storage/public/index.js';
import { invalidate } from './cache.service.js';
import { scanFile } from './virus-scan.service.js';
import { record } from './audit.service.js';
import { tagsFor } from '../constants/cache-tags.js';
import type { CacheEntity } from '../constants/cache-tags.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { StoredImage } from '../interfaces/integrations/storage.interface.js';
import type { ErrorDetail, MediaKind } from '../types/api.js';

/**
 * The media library: images, and PDF documents (ADR-053).
 *
 * Two rules shape everything here. A file is whatever its bytes say it is, not
 * whatever its name or `Content-Type` claims (ADR-016). And "where is this
 * used?" is computed from `constants/media-refs.ts` on demand rather than
 * stored as back-references, so nothing has to be kept in sync on every write
 * — at the price of the registry itself having to be complete (ADR-013).
 *
 * A reference field may hold one id or an array of them (a carousel), so every
 * walk over the registry below treats a path's value as a list.
 */

export type MediaDoc = IMedia & { _id: Types.ObjectId };

export interface MediaUsage {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
  readonly field: string;
}

/**
 * A usage plus the value its cache tags are keyed by.
 *
 * Internal: `MediaUsage` is the contract shape, and the slug is no business of
 * the dashboard. Keeping them apart is what stopped the tag being built from
 * the display label.
 */
interface TaggedUsage extends MediaUsage {
  readonly tagValue: string;
}

export interface ListMediaOptions {
  readonly q?: string;
  readonly kind?: MediaKind;
  readonly unused?: boolean;
  readonly sort: 'newest' | 'oldest';
  readonly page: number;
  readonly pageSize: number;
}

export interface UploadInput {
  readonly kind: MediaKind;
  readonly buffer: Buffer;
  readonly originalFilename: string;
  /** Required for an image; the validator has already checked. */
  readonly alt?: string | null;
  /** Required for a document; the validator has already checked. */
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

/**
 * A PDF, or a 415: the bytes must say `%PDF`, whatever the name or the
 * declared type claim. A "PDF" that is not one is refused before anything is
 * stored (ADR-053).
 */
async function assertDocument(buffer: Buffer): Promise<void> {
  if (sniffDocumentType(buffer) !== PDF_MIME) {
    throw new UnsupportedMediaTypeError('Upload a PDF. Only PDF documents are accepted.');
  }

  if (buffer.byteLength > UPLOAD_LIMITS.documentMaxBytes) {
    throw new PayloadTooLargeError(
      `The document must be ${String(UPLOAD_LIMITS.documentMaxBytes / (1024 * 1024))} MB or smaller.`
    );
  }

  // A PDF goes out at a public URL for every visitor to open, so it is
  // scanned like a CV before anything is stored — through the same adapter,
  // with the same opt-out rules (ADR-041).
  if ((await scanFile(buffer)) === 'infected') {
    throw new FileRejectedError('That document did not pass the security scan.');
  }
}

/**
 * The multipart limit is the document limit, the larger of the two, because
 * multer cannot know the kind before it has read the body. Images keep their
 * own, smaller ceiling here.
 */
function assertImageSize(buffer: Buffer): void {
  if (buffer.byteLength > UPLOAD_LIMITS.imageMaxBytes) {
    throw new PayloadTooLargeError(
      `The image must be ${String(UPLOAD_LIMITS.imageMaxBytes / (1024 * 1024))} MB or smaller.`
    );
  }
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
  assertImageSize(buffer);
  const mimeType = acceptedType(buffer);
  // Sharp's types declare width and height as always present; at runtime they
  // are absent for a file it can identify but not decode. The cast widens them
  // back to the truth rather than pretending the guard below is unreachable.
  const { width, height } = (await sharp(buffer).metadata()) as {
    width?: number;
    height?: number;
  };

  // An image whose dimensions sharp cannot read is a broken or truncated file.
  // Storing it would fail the model's required fields as a 500; saying so here
  // gives the editor the same answer as any other unusable upload.
  if (width === undefined || height === undefined || width < 1 || height < 1) {
    throw new UnsupportedMediaTypeError(
      'That image could not be read. It may be truncated or corrupt.'
    );
  }

  const stored = await publicStorage().put({ buffer, mimeType, originalFilename });

  return { stored, mimeType, width, height };
}

const providerName = (): 'cloudinary' | 'local' =>
  publicStorage().name === 'cloudinary' ? 'cloudinary' : 'local';

async function uploadDocument(input: UploadInput, context: ActorContext): Promise<MediaDoc> {
  await assertDocument(input.buffer);

  const stored = await publicStorage().putDocument({
    buffer: input.buffer,
    originalFilename: input.originalFilename,
  });

  const created = await Media.create({
    kind: 'document',
    provider: providerName(),
    storageKey: stored.storageKey,
    url: stored.url,
    sizes: null,
    version: 1,
    width: null,
    height: null,
    mimeType: PDF_MIME,
    bytes: input.buffer.byteLength,
    originalFilename: input.originalFilename,
    title: input.title ?? null,
    alt: null,
    focalPoint: null,
    uploadedBy: context.actorId ?? null,
  });

  return created.toObject();
}

export async function uploadMedia(
  input: UploadInput,
  context: ActorContext = {}
): Promise<MediaDoc> {
  if (input.kind === 'document') return uploadDocument(input, context);

  const { stored, mimeType, width, height } = await storeImage(
    input.buffer,
    input.originalFilename
  );

  const created = await Media.create({
    kind: 'image',
    provider: providerName(),
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

  if (options.kind !== undefined) filter.kind = options.kind;

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

/**
 * One call for the record and where it is used.
 *
 * The controller asked for both separately, which ran the five-model registry
 * sweep a second time on writes that had already run it while invalidating.
 */
export async function getMediaWithUsages(
  id: string
): Promise<{ doc: MediaDoc; usedBy: MediaUsage[] }> {
  const [doc, usedBy] = await Promise.all([getMedia(id), findUsages(id)]);

  return { doc, usedBy };
}

export interface UpdateMediaInput {
  readonly alt?: string;
  readonly title?: string | null;
  readonly focalPoint?: { x: number; y: number };
}

/**
 * A document has no alt text or focal point, and its title is its link text,
 * so it cannot be cleared (ADR-053). Said with a field path, so the dashboard
 * can point at the input.
 */
function assertEditableFor(kind: MediaKind, input: UpdateMediaInput): void {
  if (kind !== 'document') return;

  const details: ErrorDetail[] = [];
  if (input.alt !== undefined) details.push({ path: 'alt', message: 'a document has no alt text' });
  if (input.focalPoint !== undefined) {
    details.push({ path: 'focalPoint', message: 'a document has no focal point' });
  }
  if (input.title === null || input.title === '') {
    details.push({ path: 'title', message: 'a document needs a title, which is its link text' });
  }

  if (details.length > 0)
    throw new ValidationError('That edit does not apply to a document', details);
}

export async function updateMedia(
  id: string,
  expectedRevision: number,
  input: UpdateMediaInput
): Promise<MediaDoc> {
  const changes: Record<string, unknown> = { ...input };
  const existing = await getMedia(id);

  assertEditableFor(existing.kind, input);

  if (input.focalPoint !== undefined) {
    // Cloudinary bakes the focal point into the size URLs as gravity, so the
    // stored `sizes` go stale the moment it moves (ADR-030). The local driver
    // returns undefined here, because its widths are uncropped files.
    const sizes = publicStorage().resize(existing.storageKey, existing.mimeType, input.focalPoint);

    if (sizes !== undefined) changes.sizes = sizes;
  }

  const updated = await Media.findOneAndUpdate(
    { _id: id, revision: expectedRevision },
    { $set: changes, $inc: { revision: 1 } },
    { new: true, runValidators: true }
  ).lean<MediaDoc | null>();

  if (!updated) throw await staleOrMissing(id);

  // Alt text and focal point are rendered into every page using the image.
  await invalidateUsages(id);

  return updated;
}

/** Whichever of 404 and 409 actually happened, told apart by one read. */
async function staleOrMissing(id: string): Promise<Error> {
  const current = await Media.findById(id).select('revision').lean<{ revision: number } | null>();
  if (!current) return new NotFoundError('Image');

  return new ConflictError(
    'This image changed since you loaded it. Reload and reapply your changes.',
    [{ path: 'revision', message: `current revision is ${String(current.revision)}` }]
  );
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
  expectedRevision: number,
  buffer: Buffer,
  originalFilename: string,
  context: ActorContext = {}
): Promise<MediaDoc> {
  const existing = await getMedia(id);

  // The replacement must be the same kind, so every field pointing at this id
  // keeps holding what it expects: a PDF for a document, a picture for an image.
  let changes: Record<string, unknown>;
  let storedKey: string;

  if (existing.kind === 'document') {
    await assertDocument(buffer);
    const stored = await publicStorage().putDocument({ buffer, originalFilename });
    storedKey = stored.storageKey;
    changes = { url: stored.url, mimeType: PDF_MIME };
  } else {
    const { stored, mimeType, width, height } = await storeImage(buffer, originalFilename);
    storedKey = stored.storageKey;
    changes = { url: stored.url, sizes: stored.sizes, width, height, mimeType };
  }

  const updated = await Media.findOneAndUpdate(
    { _id: id, revision: expectedRevision },
    {
      $set: {
        provider: providerName(),
        storageKey: storedKey,
        // A new URL on purpose (in `changes`), so no browser or CDN can keep
        // serving the old file from a cached copy of the same address.
        ...changes,
        bytes: buffer.byteLength,
        originalFilename,
      },
      $inc: { version: 1, revision: 1 },
    },
    { new: true, runValidators: true }
  ).lean<MediaDoc | null>();

  if (!updated) {
    // We lost the race, or the record is gone. Either way the file just
    // uploaded is referenced by nothing, so it is removed here rather than
    // left behind as an orphan nobody will ever find.
    await removeStored(storedKey, existing.kind);
    throw await staleOrMissing(id);
  }

  await removeStored(existing.storageKey, existing.kind);
  await invalidateUsages(id);

  await record({
    action: 'media.replace',
    entity: 'media',
    entityId: existing._id,
    actor: context.actorId ?? null,
    // The alt text describes the picture, not a person, so it is safe to keep.
    meta: { kind: existing.kind, alt: existing.alt ?? existing.title, version: updated.version },
  });

  return updated;
}

export async function deleteMedia(id: string, context: ActorContext = {}): Promise<void> {
  const existing = await getMedia(id);
  const usages = await findUsages(id);

  if (usages.length > 0) {
    throw new ConflictError(
      `This ${existing.kind} is still in use. Remove it from the records below before deleting it.`,
      usages.map((usage) => ({
        path: 'usedBy',
        message: `${usage.collection}: ${usage.label} (${usage.field})`,
      }))
    );
  }

  await Media.deleteOne({ _id: id });
  await removeStored(existing.storageKey, existing.kind);

  await record({
    action: 'media.delete',
    entity: 'media',
    entityId: existing._id,
    actor: context.actorId ?? null,
    meta: { kind: existing.kind, alt: existing.alt ?? existing.title },
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
  return (await findTaggedUsages(id)).map(({ tagValue: _tagValue, ...usage }) => usage);
}

async function findTaggedUsages(id: string): Promise<TaggedUsage[]> {
  const objectId = new mongoose.Types.ObjectId(id);

  const perModel = await Promise.all(
    MEDIA_REF_MODELS.map(async (modelName) => {
      const refs = mediaRefsFor(modelName);
      const model = mongoose.model(modelName) as unknown as Model<unknown>;

      const extras = [...new Set(refs.flatMap((ref) => [ref.label, ref.tagField]))];

      const docs = await model
        .find({ $or: refs.map((ref) => ({ [ref.path]: objectId })) })
        .select([...refs.map((ref) => ref.path), ...extras].join(' '))
        .lean<Record<string, unknown>[]>();

      return docs.flatMap((doc) =>
        refs
          .filter((ref) => idsAt(doc, ref.path).includes(id))
          .map((ref) => ({
            collection: ref.collection,
            id: idOf(doc._id),
            label: labelOf(doc[ref.label]),
            field: ref.path,
            tagValue: labelOf(doc[ref.tagField]),
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

/** Every id a path holds: none, one, or a carousel's worth. */
function idsAt(doc: Record<string, unknown>, path: string): string[] {
  const value = atPath(doc, path);
  return (Array.isArray(value) ? value : [value]).map(idOf).filter((item) => item !== '');
}

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
        // `$exists` rather than `$ne: null` alone, so an empty carousel is not
        // fetched for nothing; an array field matches when non-empty.
        .find({
          $or: refs.map((ref) => ({ [ref.path]: { $exists: true, $nin: [null, []] } })),
        })
        .select(refs.map((ref) => ref.path).join(' '))
        .lean<Record<string, unknown>[]>();

      return docs.flatMap((doc) =>
        refs
          .flatMap((ref) => {
            const value = atPath(doc, ref.path);
            return Array.isArray(value) ? (value as unknown[]) : [value];
          })
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
  recognitionDirectories: 'recognitionDirectory',
  awards: 'award',
  pages: 'page',
};

/**
 * Clear the caches of everything showing this image.
 *
 * Without this, replacing a picture changes the URL in the database while
 * every cached page keeps rendering the old one.
 */
async function invalidateUsages(id: string): Promise<void> {
  const usages = await findTaggedUsages(id);

  const tags = new Set<string>();
  for (const usage of usages) {
    const entity = ENTITY_BY_COLLECTION[usage.collection];
    if (entity === undefined) continue;

    // The slug or page key, never the display label: `tagsFor` builds
    // `practice-area:${slug}`, and the frontend revalidates by that exact tag.
    for (const tag of tagsFor(entity, usage.tagValue)) tags.add(tag);
  }

  if (tags.size > 0) invalidate([...tags]);
}

/** Storage failures are logged, never fatal: the record is already correct. */
async function removeStored(storageKey: string, kind: MediaKind = 'image'): Promise<void> {
  try {
    await publicStorage().remove(storageKey, kind);
  } catch (error) {
    logger.warn({ err: error, storageKey }, 'could not remove the stored file');
  }
}

/**
 * Refuse a write that points a media field at the wrong kind — a PDF in a
 * hero, a picture as the firm profile (ADR-053).
 *
 * `doc` is the candidate in its editable shape (ids as strings), or a partial
 * update: only the paths it actually carries are checked. An id that matches
 * no record is left alone here — it populates to nothing and reads as empty —
 * so this checks what a reference *is*, not whether it exists.
 */
export async function assertMediaKinds(model: string, doc: Record<string, unknown>): Promise<void> {
  const refs = mediaRefsFor(model);
  if (refs.length === 0) return;

  const wanted = new Map<string, { path: string; kind: MediaKind }[]>();
  for (const ref of refs) {
    for (const id of idsAt(doc, ref.path)) {
      if (!mongoose.isValidObjectId(id)) continue;
      const list = wanted.get(id) ?? [];
      list.push({ path: ref.path, kind: ref.kind });
      wanted.set(id, list);
    }
  }
  if (wanted.size === 0) return;

  const found = await Media.find({ _id: { $in: [...wanted.keys()] } })
    .select('kind')
    .lean<{ _id: Types.ObjectId; kind: MediaKind }[]>();

  const details: ErrorDetail[] = [];
  for (const media of found) {
    for (const use of wanted.get(media._id.toHexString()) ?? []) {
      if (media.kind !== use.kind) {
        details.push({
          path: use.path,
          message:
            use.kind === 'document'
              ? 'must be a PDF document from the media library, not an image'
              : 'must be an image from the media library, not a document',
        });
      }
    }
  }

  if (details.length > 0) {
    throw new ValidationError('A media reference points at the wrong kind of file', details);
  }
}

/** Exported for the registry guard test, which asserts nothing is missing. */
export const REGISTERED_MEDIA_PATHS = MEDIA_REFS.map((ref) => `${ref.model}.${ref.path}`);
