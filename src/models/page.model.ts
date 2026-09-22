import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IPage } from '../interfaces/page.interface.js';
import { PAGE_KEYS } from '../constants/enums.js';
import {
  heroSchema,
  iconItemSchema,
  linkSchema,
  sectionHeaderSchema,
  seoSchema,
  statSchema,
  titledBodySchema,
} from './schemas/common.schemas.js';

/**
 * One document per page key.
 *
 * Every section is declared, and `strict: 'throw'` rejects anything that is
 * not — so a typo like `hreo` fails loudly instead of being stored and
 * silently ignored. Sections are optional here because the set differs per
 * key; which ones a given key must have is decided by the Zod schema in
 * `validators/pages/<key>.validator.ts`, and checked on every write.
 */

const subSchema = { _id: false, versionKey: false } as const;

const aboutFirmSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    paragraphs: { type: [String], default: [] },
    cta: { type: linkSchema, default: null },
  },
  subSchema
);

const videoShowcaseSchema = new Schema(
  {
    // Videos are linked, never uploaded: a YouTube, Vimeo or Cloudinary URL.
    videoUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    poster: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
  },
  subSchema
);

const recognitionTabsSchema = new Schema(
  {
    achievementsLabel: { type: String, required: true, trim: true, maxlength: 120 },
    recognizedByLabel: { type: String, required: true, trim: true, maxlength: 120 },
  },
  subSchema
);

const whyChooseUsSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    points: { type: [iconItemSchema], default: [] },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
  },
  subSchema
);

const storySchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    paragraphs: { type: [String], default: [] },
    quote: { type: String, default: null, trim: true, maxlength: 600 },
    quotePerson: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
  },
  subSchema
);

const statsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    items: { type: [statSchema], default: [] },
  },
  subSchema
);

const missionSectionSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    items: { type: [titledBodySchema], default: [] },
  },
  subSchema
);

const principlesSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    items: { type: [iconItemSchema], default: [] },
  },
  subSchema
);

const awardListItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    url: { type: String, default: null, trim: true, maxlength: 2048 },
  },
  subSchema
);

const awardsListSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    items: { type: [awardListItemSchema], default: [] },
  },
  subSchema
);

const csrBannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    cta: { type: linkSchema, default: null },
  },
  subSchema
);

const pageSchema = new Schema<IPage>(
  {
    key: { type: String, required: true, unique: true, enum: PAGE_KEYS.values },
    // Null on the insights page, which opens with the featured carousel.
    hero: { type: heroSchema, default: null },
    seo: { type: seoSchema, default: () => ({}) },

    // home
    aboutFirm: { type: aboutFirmSchema, default: null },
    videoShowcase: { type: videoShowcaseSchema, default: null },
    recognitionTabs: { type: recognitionTabsSchema, default: null },
    practiceSection: { type: sectionHeaderSchema, default: null },
    leadershipSection: { type: sectionHeaderSchema, default: null },
    whyChooseUs: { type: whyChooseUsSchema, default: null },
    insightsSection: { type: sectionHeaderSchema, default: null },

    // about
    story: { type: storySchema, default: null },
    stats: { type: statsSchema, default: null },
    missionSection: { type: missionSectionSchema, default: null },
    principles: { type: principlesSchema, default: null },
    awardsList: { type: awardsListSchema, default: null },

    // practice-areas
    gridSection: { type: sectionHeaderSchema, default: null },
    csrBanner: { type: csrBannerSchema, default: null },

    // people, insights, careers
    directorySection: { type: sectionHeaderSchema, default: null },
    listingSection: { type: sectionHeaderSchema, default: null },
    jobsSection: { type: sectionHeaderSchema, default: null },

    revision: { type: Number, default: 0 },
  },
  { timestamps: true, strict: 'throw' }
);

pageSchema.pre('save', function (next) {
  if (!this.isNew) this.revision += 1;
  next();
});

pageSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const { _id, __v, ...rest } = ret;
    return { ...rest, id: _id.toHexString() };
  },
});

export const Page: Model<IPage> = model<IPage>('Page', pageSchema);
