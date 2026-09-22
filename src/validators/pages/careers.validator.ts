import { z } from 'zod';
import { hero, sectionHeader, seo } from '../common.validator.js';

/** Open jobs are embedded from the jobs collection, not stored here. */
export const careersPageSchema = z.object({ hero, jobsSection: sectionHeader, seo }).strict();

export type CareersPageInput = z.infer<typeof careersPageSchema>;
