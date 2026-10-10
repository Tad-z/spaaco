import { z } from 'zod';
import { PERSON_ROLE_FILTERS } from '../constants/enums.js';
import { pagination, slug } from './common.validator.js';

/**
 * `role` is a tab, not strictly the stored role: `management`, `partner` and
 * `associate` are groups (ADR-068).
 */
export const listPeopleQuery = pagination.extend({
  role: z.enum(PERSON_ROLE_FILTERS).optional(),
  // The "Practice Area" dropdown; combines with `role` (ADR-054).
  practiceArea: slug.optional(),
  sort: z.enum(['seniority', 'name_asc', 'name_desc']).default('seniority'),
});

export const personSlugParams = z.object({ slug });

export type ListPeopleQuery = z.infer<typeof listPeopleQuery>;
export type PersonSlugParams = z.infer<typeof personSlugParams>;
