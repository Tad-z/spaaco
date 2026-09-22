import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { ISettings } from '../interfaces/settings.interface.js';
import { linkSchema } from './schemas/common.schemas.js';

/** Exactly one document, keyed `site`. */
const settingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true, enum: ['site'], default: 'site' },
    firmName: { type: String, required: true, trim: true, maxlength: 160 },
    legalDescriptor: { type: String, required: true, trim: true, maxlength: 200 },
    tagline: { type: String, required: true, trim: true, maxlength: 300 },
    foundedYear: { type: Number, required: true, min: 1800, max: 2200 },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    socials: {
      instagram: { type: String, default: null, trim: true, maxlength: 2048 },
      facebook: { type: String, default: null, trim: true, maxlength: 2048 },
      x: { type: String, default: null, trim: true, maxlength: 2048 },
      linkedin: { type: String, default: null, trim: true, maxlength: 2048 },
      youtube: { type: String, default: null, trim: true, maxlength: 2048 },
    },
    copyright: { type: String, required: true, trim: true, maxlength: 300 },
    faqSection: {
      eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
      title: { type: String, required: true, trim: true, maxlength: 200 },
    },
    stillHaveQuestions: {
      title: { type: String, required: true, trim: true, maxlength: 200 },
      text: { type: String, required: true, trim: true, maxlength: 600 },
      actions: { type: [linkSchema], default: [] },
    },
    contactCallout: {
      title: { type: String, required: true, trim: true, maxlength: 200 },
      text: { type: String, required: true, trim: true, maxlength: 800 },
      primaryCta: { type: linkSchema, default: null },
      secondaryCta: { type: linkSchema, default: null },
    },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, strict: 'throw' }
);

// Every save bumps the revision, so a stale If-Match is detectable (ADR-015).
settingsSchema.pre('save', function (next) {
  if (!this.isNew) this.revision += 1;
  next();
});

settingsSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const { _id, __v, ...rest } = ret;
    return { ...rest, id: _id.toHexString() };
  },
});

export const Settings: Model<ISettings> = model<ISettings>('Settings', settingsSchema);
