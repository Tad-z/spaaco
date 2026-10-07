import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IInsight } from '../interfaces/insight.interface.js';
import { INSIGHT_CATEGORIES, INSIGHT_FORMATS } from '../constants/enums.js';
import { contentPlugin } from './plugins/content.plugin.js';
import { legacyImportSchema } from './schemas/common.schemas.js';

/** An attorney on the site, or anyone else by name with an optional photo (ADR-064). */
const coAuthorSchema = new Schema(
  {
    person: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    name: { type: String, default: null, trim: true, maxlength: 120 },
    photo: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
  },
  { _id: false, versionKey: false }
);

const insightSchema = new Schema<IInsight>(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    excerpt: { type: String, default: null, trim: true, maxlength: 1000 },
    body: { type: String, default: null },
    format: { type: String, required: true, enum: INSIGHT_FORMATS.values, default: 'article' },
    videoUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2048,
      // A video insight renders a "Watch Video" button, so a missing URL would
      // ship a dead control to the site.
      required: [
        function (this: IInsight): boolean {
          return this.format === 'video';
        },
        'videoUrl is required when format is "video"',
      ],
    },
    // The article's "Read Article" link: an external URL or an uploaded PDF,
    // never both (ADR-051). This validator only sees a whole document (create
    // and save); under `findOneAndUpdate`, `this` is the Query and it passes,
    // so a partial update is checked by `assertOneArticleTarget` in the
    // content service instead.
    externalUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    document: {
      type: Schema.Types.ObjectId,
      ref: 'Media',
      default: null,
      validate: {
        validator: function (this: IInsight, value: unknown): boolean {
          return value === null || value === undefined || !this.externalUrl;
        },
        message: 'set either externalUrl or document, not both',
      },
    },
    categories: {
      type: [{ type: String, enum: INSIGHT_CATEGORIES.values }],
      required: true,
      validate: {
        validator: (value: string[]): boolean => value.length > 0,
        message: 'at least one category is required',
      },
    },
    practiceAreas: [{ type: Schema.Types.ObjectId, ref: 'PracticeArea' }],
    // Null means the firm is the author, not that the field is unset.
    author: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    // A writer with no attorney profile, such as former staff (ADR-060).
    authorName: { type: String, default: null, trim: true, maxlength: 120 },
    // The named writer's photo (ADR-064).
    authorPhoto: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    // Shown after the author, in order (ADR-064).
    coAuthors: { type: [coAuthorSchema], default: [] },
    coverImage: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    featured: { type: Boolean, default: false },
    legacy: { type: legacyImportSchema, default: null },
  },
  { timestamps: true, strict: 'throw' }
);

insightSchema.plugin(contentPlugin, { source: 'title' });

// The listing, filtered by category, newest first.
insightSchema.index({ status: 1, categories: 1, publishedAt: -1 });
// The featured carousel.
insightSchema.index({ status: 1, featured: 1, publishedAt: -1 });
// The practice-area filter and a practice area's related insights.
insightSchema.index({ status: 1, practiceAreas: 1, publishedAt: -1 });
insightSchema.index({ title: 'text', excerpt: 'text', body: 'text' });
// Finds, or rolls back, an import (ADR-059).
insightSchema.index({ 'legacy.source': 1, 'legacy.legacyId': 1 }, { sparse: true });

export const Insight: Model<IInsight> = model<IInsight>('Insight', insightSchema);
