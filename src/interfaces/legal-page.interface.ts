import type { ContentStatus } from '../constants/enums.js';
import type { LegalPageKey } from '../types/api.js';

/**
 * Terms of Service or Privacy Policy (ADR-057).
 *
 * A singleton per key, like a page, but with a status: a draft legal page is a
 * 404 on the public site.
 */
export interface ILegalPage {
  key: LegalPageKey;
  title: string;
  /** Sanitised HTML. */
  body: string;
  status: ContentStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
