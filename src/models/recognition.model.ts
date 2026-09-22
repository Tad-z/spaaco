import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IRecognition } from '../interfaces/recognition.interface.js';
import { RECOGNITION_TABS } from '../constants/enums.js';
import { contentPlugin } from './plugins/content.plugin.js';

const recognitionSchema = new Schema<IRecognition>(
  {
    organization: { type: String, required: true, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    year: { type: Number, default: null, min: 1900, max: 2200 },
    badge: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    url: { type: String, default: null, trim: true, maxlength: 2048 },
    tab: { type: String, required: true, enum: RECOGNITION_TABS.values, default: 'achievements' },
  },
  { timestamps: true, strict: 'throw' }
);

// Several tiles share an organisation and title, so the slug source combines
// both with the year to keep collisions rare and the slug readable.
recognitionSchema.plugin(contentPlugin, { source: 'slugSource' });

recognitionSchema.virtual('slugSource').get(function (this: IRecognition): string {
  return [this.organization, this.title, this.year].filter(Boolean).join(' ');
});

// The Home tabs.
recognitionSchema.index({ status: 1, tab: 1, order: 1 });

export const Recognition: Model<IRecognition> = model<IRecognition>(
  'Recognition',
  recognitionSchema
);
