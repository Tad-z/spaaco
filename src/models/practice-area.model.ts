import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';
import { seoBasicSchema } from './schemas/common.schemas.js';

const practiceAreaSchema = new Schema<IPracticeArea>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    shortLabel: { type: String, required: true, trim: true, maxlength: 60 },
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    body: { type: String, default: null },
    keyServices: { type: [String], default: [] },
    contacts: [{ type: Schema.Types.ObjectId, ref: 'Person' }],
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
practiceAreaSchema.index({ title: 'text', summary: 'text', body: 'text' });

export const PracticeArea: Model<IPracticeArea> = model<IPracticeArea>(
  'PracticeArea',
  practiceAreaSchema
);
