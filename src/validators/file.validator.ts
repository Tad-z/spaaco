import { z } from 'zod';

/**
 * A signed CV link, as it arrives back.
 *
 * The key is constrained to the shape the local driver issues — a UUID and an
 * extension — which rules out path traversal by construction rather than by
 * sanitising a free-form string afterwards.
 */
export const cvFileParams = z.object({
  key: z.string().regex(/^[0-9a-f-]{36}\.(pdf|docx)$/i, 'not a valid file key'),
});

export const cvFileQuery = z.object({
  expires: z.string().regex(/^\d{1,12}$/),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
  filename: z.string().max(260).default('cv'),
});

export type CvFileParams = z.infer<typeof cvFileParams>;
export type CvFileQuery = z.infer<typeof cvFileQuery>;
