import type { MediaAdmin, MediaUsage } from '../types/api.js';
import type { IMedia } from '../interfaces/media.interface.js';

/**
 * A media record as the library shows it.
 *
 * `storageKey` and `provider` are deliberately absent: they are internal
 * plumbing, and publishing a storage path invites someone to try fetching
 * around the URL the driver actually serves.
 *
 * A document has none of the image-only fields, which are null rather than
 * omitted, so the dashboard reads one shape for both kinds (ADR-053).
 */

export type StoredMedia = IMedia & { _id: { toString: () => string } };

const ISO = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(0).toISOString();

export function toMediaAdmin(doc: StoredMedia, usedBy: readonly MediaUsage[] = []): MediaAdmin {
  const image = doc.kind !== 'document';

  return {
    id: doc._id.toString(),
    kind: doc.kind,
    revision: doc.revision,
    url: doc.url,
    sizes: image && doc.sizes ? { sm: doc.sizes.sm, md: doc.sizes.md, lg: doc.sizes.lg } : null,
    alt: image ? (doc.alt ?? null) : null,
    title: doc.title ?? null,
    width: image ? (doc.width ?? null) : null,
    height: image ? (doc.height ?? null) : null,
    mimeType: doc.mimeType,
    bytes: doc.bytes,
    focalPoint: image && doc.focalPoint ? { x: doc.focalPoint.x, y: doc.focalPoint.y } : null,
    createdAt: ISO(doc.createdAt),
    updatedAt: ISO(doc.updatedAt),
    // Computed per request from the reference registry, never stored (ADR-013).
    usedBy: [...usedBy],
  };
}
