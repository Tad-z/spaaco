import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type {
  IEducation,
  IEducationEntry,
  IPerson,
  IPersonPublication,
} from '../interfaces/person.interface.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { contentPlugin } from './plugins/content.plugin.js';
import { legacyImportSchema } from './schemas/common.schemas.js';

const subSchema = { _id: false, versionKey: false } as const;

const educationEntrySchema = new Schema<IEducationEntry>(
  {
    qualification: { type: String, required: true, trim: true, maxlength: 300 },
    year: { type: Number, default: null, min: 1900, max: 2200 },
  },
  subSchema
);

const educationSchema = new Schema<IEducation>(
  {
    intro: { type: String, default: null, trim: true, maxlength: 2000 },
    entries: { type: [educationEntrySchema], default: [] },
  },
  subSchema
);

const publicationSchema = new Schema<IPersonPublication>(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    date: { type: String, default: null, trim: true, maxlength: 40 },
    label: { type: String, default: null, trim: true, maxlength: 120 },
    insight: { type: Schema.Types.ObjectId, ref: 'Insight', default: null },
  },
  subSchema
);

const personSchema = new Schema<IPerson>(
  {
    honorific: { type: String, default: null, trim: true, maxlength: 20 },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    postNominals: { type: String, default: null, trim: true, maxlength: 40 },
    role: { type: String, required: true, enum: PERSON_ROLES.values },
    // A title to show instead of the role name; the role still groups and sorts (ADR-061).
    jobTitle: { type: String, default: null, trim: true, maxlength: 80 },
    photo: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    linkedinUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    instagramUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    // Public since v2: shown on the profile and the practice-lead card (ADR-052).
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    cardBio: { type: String, default: null, trim: true, maxlength: 400 },
    bio: { type: String, default: null },
    quote: { type: String, default: null, trim: true, maxlength: 600 },
    primaryPracticeArea: { type: Schema.Types.ObjectId, ref: 'PracticeArea', default: null },
    practiceAreas: [{ type: Schema.Types.ObjectId, ref: 'PracticeArea' }],
    education: { type: educationSchema, default: () => ({ intro: null, entries: [] }) },
    memberships: { type: [String], default: [] },
    // The firm's own list; empty means the profile shows their latest insights (ADR-070).
    publications: { type: [publicationSchema], default: [] },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    featuredInLeadership: { type: Boolean, default: false },
    legacy: { type: legacyImportSchema, default: null },
  },
  { timestamps: true, strict: 'throw' }
);

// Slugs read better as a full name than as a first name alone.
personSchema.plugin(contentPlugin, { source: 'fullNameForSlug' });

/** Slug source only; display names are the serializer's job. */
personSchema.virtual('fullNameForSlug').get(function (this: IPerson): string {
  return `${this.firstName} ${this.lastName}`.trim();
});

// The directory: published people filtered by role, in manual order.
personSchema.index({ status: 1, role: 1, order: 1 });
// The directory's practice-area filter (ADR-054).
personSchema.index({ status: 1, practiceAreas: 1 });
personSchema.index({ status: 1, primaryPracticeArea: 1 });
personSchema.index({ firstName: 'text', lastName: 'text', bio: 'text' });
// Finds, or rolls back, an import (ADR-059).
personSchema.index({ 'legacy.source': 1, 'legacy.legacyId': 1 }, { sparse: true });

export const Person: Model<IPerson> = model<IPerson>('Person', personSchema);
