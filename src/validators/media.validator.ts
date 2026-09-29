import { z } from 'zod';
import { PAGINATION } from '../config/constants.js';
import { MEDIA_KINDS } from '../constants/enums.js';

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

/**
 * Multipart fields are always strings. An image needs `alt`; a document needs
 * `title`, its link text, and takes no alt (ADR-053). Checked here rather than
 * in the service, so the editor gets the field path back.
 */
export const uploadMediaBody = z
  .object({
    kind: z.enum(MEDIA_KINDS.values).default('image'),
    alt: alt.optional(),
    title: title.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'image' && value.alt === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alt'],
        message: 'alt text is required, so the site stays usable with a screen reader',
      });
    }
    if (value.kind === 'document') {
      if (value.title === undefined || value.title === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['title'],
          message: 'a document needs a title, which is its link text',
        });
      }
      if (value.alt !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['alt'],
          message: 'a document has no alt text; give it a title instead',
        });
      }
    }
  });

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
    kind: z.enum(MEDIA_KINDS.values).optional(),
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
