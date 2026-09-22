import { z } from 'zod';
import { hero, seo } from '../common.validator.js';

/** Hero only: the office cards are embedded from the offices collection. */
export const officesPageSchema = z.object({ hero, seo }).strict();

export type OfficesPageInput = z.infer<typeof officesPageSchema>;
