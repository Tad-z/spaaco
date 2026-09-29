import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IMedia } from '../interfaces/media.interface.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { MEDIA_KINDS } from '../constants/enums.js';

/**
 * The media library: images, and PDF documents (ADR-053).
 *
 * Not a content collection: no slug, status or publish state. SVG is absent
 * from the allowed types on purpose — it can carry scripts (ADR-016).
 *
 * The image-only fields are required for an image and absent for a document,
 * whose `title` is required instead, because it is the link text.
 */

const subSchema = { _id: false, versionKey: false } as const;

/**
 * The kind being written, whatever Mongoose passes as `this`: a document on
 * create and save, a Query on an update or upsert (whose kind, if it is being
 * set, is in the update), or nothing at all for some defaults.
 *
 * Unknown means "not being written here", so the kind-specific requirements
 * do not fire on an update that leaves the kind alone — the record was
 * validated when it was created.
 */
function kindOf(context: unknown): unknown {
  if (typeof context !== 'object' || context === null) return undefined;

  const query = context as { getUpdate?: () => unknown };
  if (typeof query.getUpdate === 'function') {
    const update = query.getUpdate() as { kind?: unknown; $set?: { kind?: unknown } } | null;
    return update?.$set?.kind ?? update?.kind;
  }

  return (context as { kind?: unknown }).kind;
}

function isImage(this: unknown): boolean {
  return kindOf(this) === 'image';
}

function isDocument(this: unknown): boolean {
  return kindOf(this) === 'document';
}

const sizesSchema = new Schema(
  {
    sm: { type: String, required: true },
    md: { type: String, required: true },
    lg: { type: String, required: true },
  },
  subSchema
);

const focalPointSchema = new Schema(
  {
    x: { type: Number, required: true, default: 0.5, min: 0, max: 1 },
    y: { type: Number, required: true, default: 0.5, min: 0, max: 1 },
  },
  subSchema
);

const mediaSchema = new Schema<IMedia>(
  {
    kind: { type: String, required: true, enum: MEDIA_KINDS.values, default: 'image' },
    provider: { type: String, required: true, enum: ['local', 'cloudinary'] },
    storageKey: { type: String, required: true },
    url: { type: String, required: true },
    sizes: { type: sizesSchema, default: null, required: isImage },
    version: { type: Number, required: true, default: 1, min: 1 },
    width: { type: Number, default: null, min: 1, required: isImage },
    height: { type: Number, default: null, min: 1, required: isImage },
    mimeType: {
      type: String,
      required: true,
      enum: [...UPLOAD_LIMITS.imageMimeTypes, ...UPLOAD_LIMITS.documentMimeTypes],
    },
    bytes: { type: Number, required: true, min: 1, max: UPLOAD_LIMITS.documentMaxBytes },
    originalFilename: { type: String, default: null },
    title: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      required: [isDocument, 'a document needs a title, which is its link text'],
    },
    alt: { type: String, default: null, trim: true, maxlength: 300, required: isImage },
    /** Bumped on every write, so `If-Match` can detect a stale edit (ADR-015). */
    revision: { type: Number, default: 0 },
    focalPoint: {
      type: focalPointSchema,
      default: function (this: unknown): { x: number; y: number } | null {
        return isDocument.call(this) ? null : { x: 0.5, y: 0.5 };
      },
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    replacedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: 'throw' }
);

// Library search across the fields the admin UI offers.
mediaSchema.index({ title: 'text', alt: 'text', originalFilename: 'text' });
mediaSchema.index({ createdAt: -1 });
// The library's kind filter.
mediaSchema.index({ kind: 1, createdAt: -1 });

mediaSchema.set('toJSON', {
  versionKey: false,
  // storageKey is dropped here as well as in the serializer: it is an internal
  // storage path and must never reach a client by any route.
  transform: (_doc, ret) => {
    const { _id, __v, storageKey, ...rest } = ret;
    return { ...rest, id: _id.toHexString() };
  },
});

export const Media: Model<IMedia> = model<IMedia>('Media', mediaSchema);
