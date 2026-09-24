import { z } from 'zod';

/**
 * Body shapes for the singleton writes.
 *
 * Deliberately loose here: what a page body must contain depends on its key,
 * and a patch is only a fragment. Both are checked properly by the service,
 * which validates the *merged* document against that singleton's schema — so
 * these two only establish that the body is an object at all, and that a patch
 * asks for something.
 */

export const replaceBody = z.record(z.unknown());

export const patchBody = z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, {
  message: 'at least one section is required',
});

export type ReplaceBody = z.infer<typeof replaceBody>;
export type PatchBody = z.infer<typeof patchBody>;
