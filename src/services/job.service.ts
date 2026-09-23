import type { Types } from 'mongoose';
import { Job } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { IJob } from '../interfaces/job.interface.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IOffice } from '../interfaces/office.interface.js';

export type JobDoc = Omit<IJob, 'practiceArea' | 'office'> & {
  _id: Types.ObjectId;
  practiceArea: (IPracticeArea & { _id: Types.ObjectId }) | null;
  office: (IOffice & { _id: Types.ObjectId }) | null;
};

/**
 * A vacancy is public only while it is open and before its closing date.
 * Both conditions are part of the query rather than a post-filter, so
 * pagination and counts stay correct.
 */
const openFilter = (options: PreviewOptions): Record<string, unknown> => ({
  ...publishedFilter(options),
  isOpen: true,
  $or: [{ closingDate: null }, { closingDate: { $gte: new Date() } }],
});

export async function listJobs(options: PreviewOptions = {}): Promise<JobDoc[]> {
  return Job.find(openFilter(options))
    .populate('practiceArea')
    .populate('office')
    .sort({ order: 1, createdAt: -1 })
    .lean<JobDoc[]>();
}

export async function getJobById(id: string, options: PreviewOptions = {}): Promise<JobDoc> {
  const job = await Job.findOne({ _id: id, ...openFilter(options) })
    .populate('practiceArea')
    .populate('office')
    .lean<JobDoc | null>();

  if (!job) throw new NotFoundError('Job');
  return job;
}
