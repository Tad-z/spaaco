import type { Types } from 'mongoose';

/**
 * An uploaded image in the library.
 *
 * Media is not a content collection: it has no slug, status or publish state.
 * The firm uploads through the admin UI and attaches images to content by ID.
 *
 * The `_id` is stable across file replacements while `url` changes, so every
 * page referencing an image picks up the new file at once and no cache can
 * serve the old one (ADR-013).
 */
export interface IMedia {
  kind: 'image';
  provider: 'local' | 'cloudinary';
  /** Key in the storage backend. Never exposed publicly. */
  storageKey: string;
  url: string;
  /**
   * The three responsive widths. Stored rather than derived, because the rule
   * differs per provider and a serializer cannot know which one applies.
   */
  sizes: { sm: string; md: string; lg: string };
  /** Incremented on every file replacement, so URLs stay cache-bustable. */
  version: number;
  width: number;
  height: number;
  mimeType: string;
  bytes: number;
  originalFilename?: string | null;
  title?: string | null;
  /** Required: the admin UI enforces alt text on upload. */
  alt: string;
  /** Relative focal point for art-directed cropping. Defaults to the centre. */
  /** Optimistic-locking counter; see ADR-015. */
  revision: number;
  focalPoint: { x: number; y: number };
  uploadedBy?: Types.ObjectId | null;
  replacedBy?: Types.ObjectId | null;
  replacedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
