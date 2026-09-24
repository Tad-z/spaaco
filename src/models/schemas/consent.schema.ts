import { Schema } from 'mongoose';
import type { IConsent } from '../../interfaces/enquiry.interface.js';

/**
 * Consent, stored as proof rather than as a flag.
 *
 * `given` can only be true: a record exists because somebody consented, so
 * there is no false to store. The wording version and the moment are what make
 * it evidence later (NDPA 2023).
 */
export const consentSchema = new Schema<IConsent>(
  {
    given: {
      type: Boolean,
      required: true,
      // Mongoose has no enum for booleans, so the constraint is a validator.
      validate: { validator: (value: boolean): boolean => value, message: 'consent is required' },
    },
    textVersion: { type: String, required: true, trim: true, maxlength: 40 },
    at: { type: Date, required: true },
  },
  { _id: false, versionKey: false }
);
