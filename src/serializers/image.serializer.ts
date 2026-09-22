import type { Image, NullableImage } from '../types/api.js';
import type { IMedia } from '../interfaces/media.interface.js';

/**
 * Media document → the API's Image shape.
 *
 * Images are always an object, never a bare URL string, so the frontend never
 * has to guess dimensions or pick a width. `storageKey` is deliberately absent:
 * it is an internal path.
 */

/** A populated media reference, or the absence of one. */
export type MediaSource = IMedia | null | undefined;

export function toImage(media: IMedia): Image {
  return {
    url: media.url,
    alt: media.alt,
    width: media.width,
    height: media.height,
    sizes: { sm: media.sizes.sm, md: media.sizes.md, lg: media.sizes.lg },
    focalPoint: { x: media.focalPoint.x, y: media.focalPoint.y },
  };
}

/**
 * Most image fields are optional, and stay null until the firm uploads one, so
 * this is the form nearly every caller wants.
 */
export function toNullableImage(media: MediaSource): NullableImage {
  // An unpopulated ObjectId is not a media document; treat it as absent rather
  // than emitting a half-built image.
  if (media === null || media === undefined || typeof media.url !== 'string') return null;
  return toImage(media);
}
