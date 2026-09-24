import type { MediaAdmin, MediaUsage } from '../types/api.js';
import type { IMedia } from '../interfaces/media.interface.js';

/**
 * A media record as the library shows it.
 *
 * `storageKey` and `provider` are deliberately absent: they are internal
 * plumbing, and publishing a storage path invites someone to try fetching
 * around the URL the driver actually serves.
 */

export type StoredMedia = IMedia & { _id: { toString: () => string } };

const ISO = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(0).toISOString();

export function toMediaAdmin(doc: StoredMedia, usedBy: readonly MediaUsage[] = []): MediaAdmin {
  return {
    id: doc._id.toString(),
    revision: doc.revision,
    url: doc.url,
    sizes: { sm: doc.sizes.sm, md: doc.sizes.md, lg: doc.sizes.lg },
    alt: doc.alt,
    title: doc.title ?? null,
    width: doc.width,
    height: doc.height,
    mimeType: doc.mimeType,
    bytes: doc.bytes,
    focalPoint: { x: doc.focalPoint.x, y: doc.focalPoint.y },
    createdAt: ISO(doc.createdAt),
    updatedAt: ISO(doc.updatedAt),
    // Computed per request from the reference registry, never stored (ADR-013).
    usedBy: [...usedBy],
  };
}
