import { z } from 'zod';
import { CONTENT_STATUSES } from '../constants/enums.js';
import { richText } from './common.validator.js';

/**
 * Legal pages (ADR-057).
 *
 * The key is a slug-shaped string rather than the enum, on purpose: an unknown
 * key is a page that does not exist — a 404 — not a malformed request.
 */
export const legalKeyParams = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case')
    .max(40),
});

/** The whole page, in the shape a PUT must supply. `status` is how it is published. */
export const legalPageWriteSchema = z
  .object({
    status: z.enum(CONTENT_STATUSES.values),
    title: z.string().trim().min(1).max(200),
    body: richText(100_000),
  })
  .strict();

export type LegalKeyParams = z.infer<typeof legalKeyParams>;
export type LegalPageWriteInput = z.infer<typeof legalPageWriteSchema>;
