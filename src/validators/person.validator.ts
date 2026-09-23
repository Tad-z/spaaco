import { z } from 'zod';
import { PERSON_ROLES } from '../constants/enums.js';
import { pagination, slug } from './common.validator.js';

/**
 * `role` is a tab group, not strictly the stored role: `partner` also matches
 * the managing partner, because the directory has a Partners tab and no
 * Managing Partner tab (ADR-024).
 */
export const listPeopleQuery = pagination.extend({
  role: z.enum(PERSON_ROLES.values).optional(),
  sort: z.enum(['seniority', 'name_asc', 'name_desc']).default('seniority'),
});

export const personSlugParams = z.object({ slug });

export type ListPeopleQuery = z.infer<typeof listPeopleQuery>;
export type PersonSlugParams = z.infer<typeof personSlugParams>;
