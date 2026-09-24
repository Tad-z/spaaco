import { z } from 'zod';
import { PAGINATION } from '../config/constants.js';

/**
 * Media library requests.
 *
 * The file itself is not validated here — multer has already parsed it and the
 * service checks its bytes. These cover the fields around it, which arrive as
 * multipart strings on upload and as JSON on a metadata edit.
 */

const alt = z
  .string()
  .trim()
  .min(1, 'alt text is required, so the site stays usable with a screen reader')
  .max(300);

const title = z.string().trim().max(200);

const coordinate = z.coerce.number().min(0).max(1);

export const focalPoint = z.object({ x: coordinate, y: coordinate }).strict();

/** Multipart fields are always strings, so `title` is coerced rather than typed. */
export const uploadMediaBody = z
  .object({
    alt,
    title: title.optional(),
  })
  .strict();

export const updateMediaBody = z
  .object({
    alt: alt.optional(),
    title: title.nullable().optional(),
    focalPoint: focalPoint.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export const listMediaQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    // `?unused=true` only: the absence of the flag means "everything".
    unused: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.maxPageSize)
      .default(PAGINATION.mediaPageSize),
  })
  .strict();

export type UploadMediaBody = z.infer<typeof uploadMediaBody>;
export type UpdateMediaBody = z.infer<typeof updateMediaBody>;
export type ListMediaQuery = z.infer<typeof listMediaQuery>;
