import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IIndustry } from '../interfaces/industry.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';

/** The shared industries list practice areas pick from (ADR-048). */
const industrySchema = new Schema<IIndustry>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true, strict: 'throw' }
);

industrySchema.plugin(contentPlugin, { source: 'name' });

industrySchema.index({ status: 1, order: 1 });

export const Industry: Model<IIndustry> = model<IIndustry>('Industry', industrySchema);
