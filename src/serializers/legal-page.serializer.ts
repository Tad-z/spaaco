import type { LegalPage, LegalPageAdmin } from '../types/api.js';
import type { ILegalPage } from '../interfaces/legal-page.interface.js';
import type { StoredSingleton } from './admin-singleton.serializer.js';

const ISO = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === 'string'
      ? value
      : new Date(0).toISOString();

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
 */
export function toAdminLegalPage(doc: StoredSingleton): LegalPageAdmin {
  const shaped = {
    id: String(doc._id),
    key: doc.key,
    revision: doc.revision,
    status: doc.status,
    title: doc.title,
    body: doc.body,
    updatedAt: ISO(doc.updatedAt),
  };

  // The service validated the document against the write schema, and `key`
  // against the enum on the way in, so the fields are the contract's.
  return shaped as unknown as LegalPageAdmin;
}
