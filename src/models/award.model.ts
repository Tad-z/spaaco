import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IAward } from '../interfaces/award.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';

const awardSchema = new Schema<IAward>(
  {
    directory: { type: Schema.Types.ObjectId, ref: 'RecognitionDirectory', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    year: { type: Number, required: true, min: 1900, max: 2200 },
    badge: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    featuredOnHome: { type: Boolean, default: false },
  },
  { timestamps: true, strict: 'throw' }
);

// Several awards share a title and year (the designs show two identical
// IFLR1000 badges), so the slug combines both and the plugin suffixes a clash.
awardSchema.plugin(contentPlugin, { source: 'slugSource' });

awardSchema.virtual('slugSource').get(function (this: IAward): string {
  return `${this.title} ${String(this.year)}`;
});

// A directory's page, newest year first.
awardSchema.index({ status: 1, directory: 1, year: -1, order: 1 });
// The Home badges.
awardSchema.index({ status: 1, featuredOnHome: 1, order: 1 });

export const Award: Model<IAward> = model<IAward>('Award', awardSchema);
