import { z } from 'zod';
import { hero, seo } from '../common.validator.js';

/** Hero only: the FAQ items themselves come from `GET /site`. */
export const faqPageSchema = z.object({ hero, seo }).strict();

export type FaqPageInput = z.infer<typeof faqPageSchema>;
