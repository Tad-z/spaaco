import { z } from 'zod';
import { INSIGHT_CATEGORIES } from '../constants/enums.js';
import { pagination, slug } from './common.validator.js';

export const listInsightsQuery = pagination.extend({
  category: z.enum(INSIGHT_CATEGORIES.values).optional(),
  practiceArea: slug.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const insightSlugParams = z.object({ slug });

export type ListInsightsQuery = z.infer<typeof listInsightsQuery>;
