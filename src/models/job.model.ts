import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IJob } from '../interfaces/job.interface.js';
import { EMPLOYMENT_TYPES, WORK_MODES } from '../constants/enums.js';
import { contentPlugin } from './plugins/content.plugin.js';

const jobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    practiceArea: { type: Schema.Types.ObjectId, ref: 'PracticeArea', default: null },
    /** Sanitised HTML. */
    description: { type: String, required: true, maxlength: 20000 },
    experience: { type: String, default: null, trim: true, maxlength: 200 },
    employmentType: { type: String, required: true, enum: EMPLOYMENT_TYPES.values },
    workMode: { type: String, required: true, enum: WORK_MODES.values },
    office: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    /** The public API hides the job once this date passes. */
    closingDate: { type: Date, default: null },
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true, strict: 'throw' }
);

jobSchema.plugin(contentPlugin, { source: 'title' });

// The careers listing: published, open, not past its closing date.
jobSchema.index({ status: 1, isOpen: 1, closingDate: 1, order: 1 });

export const Job: Model<IJob> = model<IJob>('Job', jobSchema);
