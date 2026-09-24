import { Types } from 'mongoose';
import type { Expanded, PageAdmin, SettingsAdmin } from '../types/api.js';
import { MEDIA_REFS } from '../constants/media-refs.js';
import { toPlainJson } from '../helpers/plain.helper.js';

/**
 * Pages and settings in their editable shape.
 *
 * Same rule as the content collections: references stay as ids, and
 * `_expanded` carries a preview of each one so the dashboard can render a
 * thumbnail or a name without a second call (ADR-014).
 */

export type StoredSingleton = Record<string, unknown>;

/**
 * The service already hands over plain values, but a serializer must be safe
 * to call with a raw document too — it is a pure function, not a stage that
 * assumes what ran before it.
 */
const plain = toPlainJson;

/** Follow a dotted path, tolerating a missing or null section. */
function atPath(doc: StoredSingleton, path: string): unknown {
  let current: unknown = doc;

  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

const asId = (value: unknown): string | undefined => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** Media paths a page document can hold, from the one registry (ADR-013). */
const PAGE_MEDIA_PATHS = MEDIA_REFS.filter((ref) => ref.model === 'Page').map((ref) => ref.path);

/**
 * The only person reference on a page: the attributed quote in the About
 * story. Unlike media there is no registry for people, because nothing is
 * computed from it — a miss here costs a missing preview, not a wrong delete.
 */
const PAGE_PERSON_PATHS = ['story.quotePerson'];

export interface ExpandTargets {
  readonly mediaIds: string[];
  readonly personIds: string[];
}

export function collectPageExpandTargets(doc: StoredSingleton): ExpandTargets {
  const mediaIds = new Set<string>();
  const personIds = new Set<string>();

  for (const path of PAGE_MEDIA_PATHS) {
    const id = asId(atPath(doc, path));
    if (id !== undefined) mediaIds.add(id);
  }

  for (const path of PAGE_PERSON_PATHS) {
    const id = asId(atPath(doc, path));
    if (id !== undefined) personIds.add(id);
  }

  return { mediaIds: [...mediaIds], personIds: [...personIds] };
}

export function toAdminPage(doc: StoredSingleton, expanded: Expanded): PageAdmin {
  const { _id, ...rest } = doc;

  const shaped = {
    ...(plain(rest) as Record<string, unknown>),
    id: String(_id),
    _expanded: expanded,
  };

  // The page's own sections vary by key, which is why `PageAdmin` is open;
  // the cast states that the required half is present.
  return shaped as unknown as PageAdmin;
}

/**
 * Settings, which unlike a page has one fixed shape — so the contract closes
 * it, and this lists the fields rather than spreading the document.
 */
export function toAdminSettings(doc: StoredSingleton): SettingsAdmin {
  const shaped = {
    id: String(doc._id),
    revision: doc.revision,
    firmName: doc.firmName,
    legalDescriptor: doc.legalDescriptor,
    tagline: doc.tagline,
    foundedYear: doc.foundedYear,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    socials: plain(doc.socials),
    copyright: doc.copyright,
    faqSection: plain(doc.faqSection),
    stillHaveQuestions: plain(doc.stillHaveQuestions),
    contactCallout: plain(doc.contactCallout),
  };

  return shaped as unknown as SettingsAdmin;
}
