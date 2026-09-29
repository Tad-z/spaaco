import type { Document, Image, NullableDocument, NullableImage } from '../types/api.js';
import type { IMedia } from '../interfaces/media.interface.js';

/**
 * Media document → the API's Image or Document shape.
 *
 * Images are always an object, never a bare URL string, so the frontend never
 * has to guess dimensions or pick a width. `storageKey` is deliberately absent:
 * it is an internal path.
 */

/** A populated media reference, or the absence of one. */
export type MediaSource = IMedia | null | undefined;

/**
 * The image, or null when the record is not a usable image.
 *
 * An unpopulated ObjectId is not a media document, and a PDF is not a picture:
 * both read as absent rather than emitting a half-built image. Writes refuse a
 * PDF in an image field (ADR-053); this is the second line, so a record that
 * slipped through cannot put a broken `<img>` on a page.
 */
function usableImage(media: MediaSource): Image | null {
  if (media === null || media === undefined || typeof media.url !== 'string') return null;
  if (media.kind === 'document') return null;

  const { sizes, width, height, alt } = media;
  if (
    !sizes ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof alt !== 'string'
  ) {
    return null;
  }

  const focalPoint = media.focalPoint ?? { x: 0.5, y: 0.5 };

  return {
    url: media.url,
    alt,
    width,
    height,
    sizes: { sm: sizes.sm, md: sizes.md, lg: sizes.lg },
    focalPoint: { x: focalPoint.x, y: focalPoint.y },
  };
}

/**
 * Most image fields are optional, and stay null until the firm uploads one, so
 * this is the form nearly every caller wants.
 */
export function toNullableImage(media: MediaSource): NullableImage {
  return usableImage(media);
}

/**
 * A carousel's slides. Anything that is not a usable image — an id a populate
 * could not resolve, a document — is dropped rather than rendered as a gap.
 */
export function toImages(media: readonly MediaSource[] | null | undefined): Image[] {
  return (media ?? []).map(usableImage).filter((image): image is Image => image !== null);
}

/** A PDF from the library, or null when absent or not a document (ADR-053). */
export function toNullableDocument(media: MediaSource): NullableDocument {
  if (media === null || media === undefined || typeof media.url !== 'string') return null;
  if (media.kind !== 'document' || typeof media.title !== 'string') return null;

  const document: Document = {
    url: media.url,
    title: media.title,
    bytes: media.bytes,
    mimeType: 'application/pdf',
  };

  return document;
}
