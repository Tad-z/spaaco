import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type {
  ICoreService,
  IPracticeArea,
  IPracticeAreaApproach,
} from '../interfaces/practice-area.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';
import { seoBasicSchema } from './schemas/common.schemas.js';

const subSchema = { _id: false, versionKey: false } as const;

const coreServiceSchema = new Schema<ICoreService>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 600 },
  },
  subSchema
);

const approachSchema = new Schema<IPracticeAreaApproach>(
  {
    text: { type: String, required: true, trim: true, maxlength: 1500 },
    points: { type: [String], default: [] },
  },
  subSchema
);

const practiceAreaSchema = new Schema<IPracticeArea>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    shortLabel: { type: String, required: true, trim: true, maxlength: 60 },
    // Three texts because the designs show three (ADR-047).
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    homeSummary: { type: String, required: true, trim: true, maxlength: 1000 },
    heroIntro: { type: String, required: true, trim: true, maxlength: 1000 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    heroImages: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    overview: { type: String, default: null, trim: true, maxlength: 3000 },
    coreServices: {
      type: [coreServiceSchema],
      required: true,
      validate: {
        validator: (value: unknown[]): boolean => value.length >= 1 && value.length <= 6,
        message: 'a practice area needs between one and six core services',
      },
    },
    approach: { type: approachSchema, default: null },
    industries: [{ type: Schema.Types.ObjectId, ref: 'Industry' }],
    lead: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    featuredOnHome: { type: Boolean, default: true },
    homeOrder: { type: Number, default: null },
    showInFooter: { type: Boolean, default: true },
    seo: { type: seoBasicSchema, default: () => ({}) },
  },
  { timestamps: true, strict: 'throw' }
);

practiceAreaSchema.plugin(contentPlugin, { source: 'title' });

// The public list: published items in manual order.
practiceAreaSchema.index({ status: 1, order: 1 });
practiceAreaSchema.index({ title: 'text', summary: 'text', overview: 'text' });

export const PracticeArea: Model<IPracticeArea> = model<IPracticeArea>(
  'PracticeArea',
  practiceAreaSchema
);
