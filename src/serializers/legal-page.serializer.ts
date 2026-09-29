import type { LegalPage, LegalPageAdmin, LegalPageKey } from '../types/api.js';
import type { ILegalPage } from '../interfaces/legal-page.interface.js';
import type { ContentStatus } from '../constants/enums.js';
import { CONTENT_STATUSES, LEGAL_PAGE_KEYS } from '../constants/enums.js';
import type { StoredSingleton } from './admin-singleton.serializer.js';

const ISO = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === 'string'
      ? value
      : new Date(0).toISOString();

const isLegalKey = (value: unknown): value is LegalPageKey =>
  (LEGAL_PAGE_KEYS.values as readonly unknown[]).includes(value);

const isStatus = (value: unknown): value is ContentStatus =>
  (CONTENT_STATUSES.values as readonly unknown[]).includes(value);

/** A stored legal page that is not what the model guarantees is a fault, not a payload. */
class MalformedLegalPageError extends Error {
  constructor(field: string) {
    super(`Legal page document has an invalid "${field}"`);
    this.name = 'MalformedLegalPageError';
  }
}

/** The public page. `updatedAt` backs a "Last updated" line. */
export const toLegalPage = (page: ILegalPage): LegalPage => ({
  key: page.key,
  title: page.title,
  body: page.body,
  updatedAt: ISO(page.updatedAt),
});

/**
 * The editable shape. Minus `id`, `key`, `revision` and `updatedAt`, it is a
 * valid PUT body — `status` included, since that is how a legal page is
 * published or withdrawn (ADR-057).
 *
 * The singleton service hands over plain values, so each field is narrowed
 * rather than cast: the return type stays checked against the contract.
 */
export function toAdminLegalPage(doc: StoredSingleton): LegalPageAdmin {
  const { key, status, title, body, revision } = doc;

  if (!isLegalKey(key)) throw new MalformedLegalPageError('key');
  if (!isStatus(status)) throw new MalformedLegalPageError('status');
  if (typeof title !== 'string') throw new MalformedLegalPageError('title');
  if (typeof body !== 'string') throw new MalformedLegalPageError('body');
  if (typeof revision !== 'number') throw new MalformedLegalPageError('revision');

  return {
    id: String(doc._id),
    key,
    revision,
    status,
    title,
    body,
    updatedAt: ISO(doc.updatedAt),
  };
}
