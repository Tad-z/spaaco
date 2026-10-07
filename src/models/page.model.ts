import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IPage } from '../interfaces/page.interface.js';
import { INSIGHT_CATEGORIES, PAGE_KEYS } from '../constants/enums.js';
import {
  heroSchema,
  iconItemSchema,
  linkSchema,
  pendingLinkSchema,
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
    caption: { type: String, default: null, trim: true, maxlength: 300 },
  },
  subSchema
);

/** The badges are the awards flagged for Home, not stored here (ADR-056). */
const recognitionSectionSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    cta: { type: pendingLinkSchema, required: true },
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

const profileDownloadSchema = new Schema(
  {
    leadText: { type: String, required: true, trim: true, maxlength: 300 },
    linkLabel: { type: String, required: true, trim: true, maxlength: 60 },
    // A media record of kind `document`: the firm profile PDF (ADR-053).
    document: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
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
    profileDownload: { type: profileDownloadSchema, default: null },
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

// The rows are the recognition directories, composed at read time (ADR-056).
const awardsListSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
  },
  subSchema
);

const csrBannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    cta: { type: linkSchema, default: null },
  },
  subSchema
);

const emptyStateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 4000 },
    ctaLabel: { type: String, required: true, trim: true, maxlength: 60 },
  },
  subSchema
);

const jobsSectionSchema = new Schema(
  {
    eyebrow: { type: String, default: null, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    cta: { type: linkSchema, default: null },
    emptyState: { type: emptyStateSchema, default: null },
  },
  subSchema
);

const directoryPageSchema = new Schema(
  {
    awardsEyebrow: { type: String, required: true, trim: true, maxlength: 160 },
    primaryCta: { type: linkSchema, default: null },
    secondaryCta: { type: linkSchema, default: null },
  },
  subSchema
);

// One stand-in cover per insight category, shown on any insight that has no
// cover of its own (ADR-063).
const categoryCoversSchema = new Schema(
  Object.fromEntries(
    INSIGHT_CATEGORIES.values.map((category) => [
      category,
      { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    ])
  ),
  subSchema
);

const pageSchema = new Schema<IPage>(
  {
    key: { type: String, required: true, unique: true, enum: PAGE_KEYS.values },
    // Null on the pages that open without a banner: insights, recognition,
    // responsible-business.
    hero: { type: heroSchema, default: null },
    seo: { type: seoSchema, default: () => ({}) },

    // home
    aboutFirm: { type: aboutFirmSchema, default: null },
    videoShowcase: { type: videoShowcaseSchema, default: null },
    recognitionSection: { type: recognitionSectionSchema, default: null },
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
    categoryCovers: { type: categoryCoversSchema, default: null },
    jobsSection: { type: jobsSectionSchema, default: null },

    // recognition
    directoryPage: { type: directoryPageSchema, default: null },

    // responsible-business
    title: { type: String, default: null, trim: true, maxlength: 200 },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    backLink: { type: linkSchema, default: null },

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
