import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { ILegalPage } from '../interfaces/legal-page.interface.js';
import { CONTENT_STATUSES, LEGAL_PAGE_KEYS } from '../constants/enums.js';

/**
 * Terms of Service and Privacy Policy: one document per key (ADR-057).
 *
 * A singleton like a page — the keys are fixed, so there is no create or
 * delete — but with a status, because a law firm must be able to withdraw a
 * legal text it has not approved.
 */
const legalPageSchema = new Schema<ILegalPage>(
  {
    key: { type: String, required: true, unique: true, enum: LEGAL_PAGE_KEYS.values },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    /** Sanitised HTML. */
    body: { type: String, required: true, maxlength: 80_000 },
    status: { type: String, required: true, enum: CONTENT_STATUSES.values, default: 'draft' },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, strict: 'throw' }
);

legalPageSchema.pre('save', function (next) {
  if (!this.isNew) this.revision += 1;
  next();
});

legalPageSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const { _id, __v, ...rest } = ret;
    return { ...rest, id: _id.toHexString() };
  },
});

export const LegalPage: Model<ILegalPage> = model<ILegalPage>('LegalPage', legalPageSchema);
