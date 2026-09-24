/**
 * Storage for files that are never publicly served.
 *
 * Only CVs live here. Nothing has a stable public URL: every read goes through
 * a short-lived signed link issued by an admin endpoint, so access can be
 * attributed and expires on its own.
 */

export interface PutPrivateFile {
  readonly buffer: Buffer;
  readonly mimeType: string;
  /** Extension only; the stored key is random, never the uploaded name. */
  readonly extension: string;
}

export interface StoredObject {
  readonly key: string;
  /**
   * When the file was written.
   *
   * The orphan sweep needs it: a CV is stored before its record is created, so
   * for a moment every upload in flight looks exactly like an orphan.
   */
  readonly lastModified: Date;
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface IPrivateStorage {
  readonly name: string;
  put(input: PutPrivateFile): Promise<string>;
  /** A link valid for `ttlSeconds`, and no longer. */
  signedUrl(storageKey: string, ttlSeconds: number, filename: string): Promise<SignedUrl>;
  remove(storageKey: string): Promise<void>;
  /** Everything currently stored, for the orphan sweep (ROADMAP 6.5). */
  list(): Promise<StoredObject[]>;
}
