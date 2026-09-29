/**
 * Public image storage.
 *
 * The three responsive widths are the driver's job, not the caller's, because
 * that is precisely where the two drivers differ: the local driver renders
 * them with sharp at upload time and stores three files, while Cloudinary
 * serves them as transformation URLs off the one upload (ARCHITECTURE, "Media
 * lifecycle"). A caller that built the URLs itself would be wrong for one of
 * them.
 */

export interface ImageSizeUrls {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
}

export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

export interface PutImageInput {
  readonly buffer: Buffer;
  readonly mimeType: string;
  /** Used only to make the stored key readable; never trusted. */
  readonly originalFilename: string;
  /** Where a crop should centre. Defaults to the middle of the image. */
  readonly focalPoint?: FocalPoint;
}

export interface StoredImage {
  /** Internal path or public id. Never leaves the API (see `MediaAdmin`). */
  readonly storageKey: string;
  readonly url: string;
  readonly sizes: ImageSizeUrls;
}

export interface PutDocumentInput {
  readonly buffer: Buffer;
  /** Used only to make the stored key readable; never trusted. */
  readonly originalFilename: string;
}

/** A stored PDF: one file, no sizes (ADR-053). */
export interface StoredDocument {
  readonly storageKey: string;
  readonly url: string;
}

/** What a stored file is, which decides how a driver finds it again to delete it. */
export type StoredKind = 'image' | 'document';

export interface IPublicStorage {
  readonly name: string;
  put(input: PutImageInput): Promise<StoredImage>;
  /** Store a PDF as-is. The caller has already checked its magic bytes. */
  putDocument(input: PutDocumentInput): Promise<StoredDocument>;
  /**
   * The size URLs for an already-stored image at a new focal point, or
   * `undefined` when the driver's widths are files rather than URLs and so
   * cannot be re-pointed without a re-upload (ADR-030).
   *
   * `mimeType` comes from the record rather than the key: a Cloudinary public
   * id carries no extension.
   */
  resize(storageKey: string, mimeType: string, focalPoint: FocalPoint): ImageSizeUrls | undefined;
  /** Best effort: a failure is logged, never fatal (ARCHITECTURE step 4). */
  remove(storageKey: string, kind?: StoredKind): Promise<void>;
}
