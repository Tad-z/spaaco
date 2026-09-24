import { Types } from 'mongoose';
import type { AdminCollection, AdminContentItem, Expanded } from '../types/api.js';
import { CONTENT_COLLECTIONS } from '../constants/content-collections.js';

/**
 * The editable shape: references stay as ids, exactly as the dashboard must
 * send them back, with `_expanded` carrying a minimal preview of each one so
 * thumbnails and names render without extra calls (ADR-014).
 *
 * Read-only fields are emitted, but `_expanded` is not accepted on write: the
 * write schemas are `.strict()`, so sending it back is a 400 rather than a
 * silently ignored field.
 */

export type StoredDoc = Record<string, unknown>;

const ISO = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;

/**
 * A reference as an id string, whether it arrived raw or populated.
 *
 * Anything else is treated as absent rather than stringified, so a malformed
 * value cannot reach the dashboard as "[object Object]".
 */
const idOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();

  if (typeof value === 'object' && value !== null && '_id' in value) {
    return idOrNull((value)._id);
  }

  return null;
};

const idList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => idOrNull(item)).filter((id): id is string => id !== null) : [];

/** Fields every content item carries, in the shape the contract declares. */
function meta(doc: StoredDoc): Record<string, unknown> {
  return {
    id: String(doc._id),
    slug: doc.slug,
    status: doc.status,
    publishedAt: ISO(doc.publishedAt),
    order: doc.order ?? 0,
    revision: doc.revision ?? 0,
    createdAt: ISO(doc.createdAt) ?? new Date(0).toISOString(),
    updatedAt: ISO(doc.updatedAt) ?? new Date(0).toISOString(),
  };
}

/** Which ids in this document need a preview, and of what kind. */
export interface ExpandTargets {
  readonly mediaIds: string[];
  readonly personIds: string[];
}

export function collectExpandTargets(
  collection: AdminCollection,
  docs: readonly StoredDoc[]
): ExpandTargets {
  const config = CONTENT_COLLECTIONS[collection];
  const mediaIds = new Set<string>();
  const personIds = new Set<string>();

  for (const doc of docs) {
    for (const path of config.mediaPaths) {
      const id = idOrNull(doc[path]);
      if (id !== null) mediaIds.add(id);
    }
    for (const path of config.personPaths) {
      const value = doc[path];
      if (Array.isArray(value)) {
        for (const id of idList(value)) personIds.add(id);
      } else {
        const id = idOrNull(value);
        if (id !== null) personIds.add(id);
      }
    }
  }

  return { mediaIds: [...mediaIds], personIds: [...personIds] };
}

const shapers: Record<AdminCollection, (doc: StoredDoc) => Record<string, unknown>> = {
  'practice-areas': (doc) => ({
    title: doc.title,
    shortLabel: doc.shortLabel,
    summary: doc.summary,
    image: idOrNull(doc.image),
    body: doc.body ?? null,
    keyServices: doc.keyServices ?? [],
    contacts: idList(doc.contacts),
    featuredOnHome: doc.featuredOnHome ?? true,
    homeOrder: doc.homeOrder ?? null,
    showInFooter: doc.showInFooter ?? true,
    seo: {
      title: (doc.seo as { title?: string | null } | undefined)?.title ?? null,
      description: (doc.seo as { description?: string | null } | undefined)?.description ?? null,
    },
  }),
  people: (doc) => ({
    honorific: doc.honorific ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    postNominals: doc.postNominals ?? null,
    role: doc.role,
    photo: idOrNull(doc.photo),
    linkedinUrl: doc.linkedinUrl ?? null,
    // Present here but never in a public payload: the firm may publish it one
    // day, and the editor needs to see it either way (DECISIONS Q9).
    email: doc.email ?? null,
    bio: doc.bio ?? null,
    quote: doc.quote ?? null,
    practiceAreas: idList(doc.practiceAreas),
    office: idOrNull(doc.office),
    featuredInLeadership: doc.featuredInLeadership ?? false,
  }),
  insights: (doc) => ({
    title: doc.title,
    excerpt: doc.excerpt ?? null,
    body: doc.body ?? null,
    format: doc.format,
    videoUrl: doc.videoUrl ?? null,
    categories: doc.categories ?? [],
    practiceAreas: idList(doc.practiceAreas),
    author: idOrNull(doc.author),
    coverImage: idOrNull(doc.coverImage),
    featured: doc.featured ?? false,
  }),
  offices: (doc) => ({
    name: doc.name,
    address: doc.address,
    hours: doc.hours,
    location: doc.location ?? null,
    directionsUrl: doc.directionsUrl ?? null,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
  }),
  recognitions: (doc) => ({
    organization: doc.organization,
    title: doc.title,
    year: doc.year ?? null,
    badge: idOrNull(doc.badge),
    url: doc.url ?? null,
    tab: doc.tab,
  }),
  faqs: (doc) => ({ question: doc.question, answer: doc.answer }),
  jobs: (doc) => ({
    title: doc.title,
    practiceArea: idOrNull(doc.practiceArea),
    description: doc.description,
    experience: doc.experience ?? null,
    employmentType: doc.employmentType,
    workMode: doc.workMode,
    office: idOrNull(doc.office),
    closingDate: ISO(doc.closingDate),
    isOpen: doc.isOpen ?? true,
  }),
};

export function toAdminContent(
  collection: AdminCollection,
  doc: StoredDoc,
  expanded: Expanded
): AdminContentItem {
  const shaped = { ...meta(doc), ...shapers[collection](doc), _expanded: expanded };

  // The shapers produce exactly the collection's schema; the cast names which
  // member of the union this is, which only the caller's `collection` knows.
  return shaped as unknown as AdminContentItem;
}
