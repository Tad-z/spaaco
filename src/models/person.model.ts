import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IPerson } from '../interfaces/person.interface.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { contentPlugin } from './plugins/content.plugin.js';

const personSchema = new Schema<IPerson>(
  {
    honorific: { type: String, default: null, trim: true, maxlength: 20 },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    postNominals: { type: String, default: null, trim: true, maxlength: 40 },
    role: { type: String, required: true, enum: PERSON_ROLES.values },
    photo: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    linkedinUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    // Stored but never serialised publicly, pending the firm's decision (Q9).
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    bio: { type: String, default: null },
    quote: { type: String, default: null, trim: true, maxlength: 600 },
    practiceAreas: [{ type: Schema.Types.ObjectId, ref: 'PracticeArea' }],
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    featuredInLeadership: { type: Boolean, default: false },
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
personSchema.index({ firstName: 'text', lastName: 'text', bio: 'text' });

export const Person: Model<IPerson> = model<IPerson>('Person', personSchema);
