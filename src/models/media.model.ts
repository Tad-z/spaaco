import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IMedia } from '../interfaces/media.interface.js';
import { UPLOAD_LIMITS } from '../config/constants.js';

/**
 * The image library.
 *
 * Not a content collection: no slug, status or publish state. SVG is absent
 * from the allowed types on purpose — it can carry scripts (ADR-016).
 */
const mediaSchema = new Schema<IMedia>(
  {
    kind: { type: String, required: true, enum: ['image'], default: 'image' },
    provider: { type: String, required: true, enum: ['local', 'cloudinary'] },
    storageKey: { type: String, required: true },
    url: { type: String, required: true },
    sizes: {
      sm: { type: String, required: true },
      md: { type: String, required: true },
      lg: { type: String, required: true },
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true, enum: UPLOAD_LIMITS.imageMimeTypes },
    bytes: { type: Number, required: true, min: 1, max: UPLOAD_LIMITS.imageMaxBytes },
    originalFilename: { type: String, default: null },
    title: { type: String, default: null, trim: true, maxlength: 200 },
    alt: { type: String, required: true, trim: true, maxlength: 300 },
    focalPoint: {
      x: { type: Number, required: true, default: 0.5, min: 0, max: 1 },
      y: { type: Number, required: true, default: 0.5, min: 0, max: 1 },
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
