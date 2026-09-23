import type { Job } from '../types/api.js';
import type { IJob } from '../interfaces/job.interface.js';
import { EMPLOYMENT_TYPES, WORK_MODES } from '../constants/enums.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import type { PracticeAreaRefSource } from './practice-area.serializer.js';
import { toRef as officeRef } from './office.serializer.js';
import type { OfficeRefSource } from './office.serializer.js';

export type JobSource = Omit<IJob, 'practiceArea' | 'office'> & {
  _id: { toString: () => string };
  practiceArea?: PracticeAreaRefSource | null;
  office?: OfficeRefSource | null;
};

export function toJob(job: JobSource): Job {
  const employmentTypeLabel = EMPLOYMENT_TYPES.labels[job.employmentType];
  const workModeLabel = WORK_MODES.labels[job.workMode];
  const office = job.office && typeof job.office.name === 'string' ? officeRef(job.office) : null;

  return {
    id: job._id.toString(),
    slug: job.slug,
    title: job.title,
    practiceArea:
      job.practiceArea && typeof job.practiceArea.title === 'string'
        ? practiceAreaRef(job.practiceArea)
        : null,
    description: job.description,
    experience: job.experience ?? null,
    employmentType: job.employmentType,
    employmentTypeLabel,
    workMode: job.workMode,
    workModeLabel,
    office,
    closingDate: job.closingDate?.toISOString() ?? null,
    // The card chips, in display order. Built here so the frontend does not
    // re-derive the ordering or the labels.
    chips: [job.experience, employmentTypeLabel, workModeLabel, office?.name].filter(
      (chip): chip is string => typeof chip === 'string' && chip.length > 0
    ),
  };
}
