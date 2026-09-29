import { z } from 'zod';
import { link, mediaIdList, seo } from '../common.validator.js';

/** The CSR page. Its grid is `GET /insights?category=pro_bono` (ADR-049). */
export const responsibleBusinessPageSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    images: mediaIdList,
    backLink: link,
    seo,
  })
  .strict();

export type ResponsibleBusinessPageInput = z.infer<typeof responsibleBusinessPageSchema>;
