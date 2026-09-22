import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IFaq } from '../interfaces/faq.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';

const faqSchema = new Schema<IFaq>(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    /** Sanitised HTML. */
    answer: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true, strict: 'throw' }
);

faqSchema.plugin(contentPlugin, { source: 'question' });

faqSchema.index({ status: 1, order: 1 });

export const Faq: Model<IFaq> = model<IFaq>('Faq', faqSchema);
