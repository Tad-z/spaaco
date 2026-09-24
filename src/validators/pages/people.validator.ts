import { z } from 'zod';
import { hero, sectionHeader, seo } from '../common.validator.js';

/** The attorney grid itself comes from `GET /people`, not from this document. */
export const peoplePageSchema = z.object({ hero, directorySection: sectionHeader, seo }).strict();

export type PeoplePageInput = z.infer<typeof peoplePageSchema>;
