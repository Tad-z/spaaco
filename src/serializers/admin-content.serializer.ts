import { Types } from 'mongoose';
import type {
  AwardAdmin,
  Expanded,
  FaqAdmin,
  IndustryAdmin,
  InsightAdmin,
  JobAdmin,
  OfficeAdmin,
  PersonAdmin,
  PracticeAreaAdmin,
  RecognitionDirectoryAdmin,
} from '../types/api.js';
import type { AdminCollection } from '../constants/content-collections.js';
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
    return idOrNull(value._id);
  }

  return null;
};

const idList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => idOrNull(item)).filter((id): id is string => id !== null)
    : [];

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

  // A path may hold one id or an array of them (a carousel's slides).
  const idsAt = (value: unknown): string[] => {
    if (Array.isArray(value)) return idList(value);
    const id = idOrNull(value);
    return id === null ? [] : [id];
  };

  for (const doc of docs) {
    for (const path of config.mediaPaths) {
      for (const id of idsAt(doc[path])) mediaIds.add(id);
    }
    for (const path of config.personPaths) {
      for (const id of idsAt(doc[path])) personIds.add(id);
    }
  }

  return { mediaIds: [...mediaIds], personIds: [...personIds] };
}

/** Embedded sub-documents as plain objects, so no Mongoose internals reach the payload. */
const plainList = (
  value: unknown,
  shape: (item: Record<string, unknown>) => Record<string, unknown>
): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
        )
        .map(shape)
    : [];

const approachOf = (value: unknown): { text: unknown; points: unknown[] } | null => {
  if (typeof value !== 'object' || value === null) return null;
  const approach = value as { text?: unknown; points?: unknown };
  return { text: approach.text, points: Array.isArray(approach.points) ? approach.points : [] };
};

const educationOf = (value: unknown): { intro: unknown; entries: Record<string, unknown>[] } => {
  const education = (typeof value === 'object' && value !== null ? value : {}) as {
    intro?: unknown;
    entries?: unknown;
  };
  return {
    intro: education.intro ?? null,
    entries: plainList(education.entries, (entry) => ({
      qualification: entry.qualification,
      year: entry.year ?? null,
    })),
  };
};

const shapers: Record<AdminCollection, (doc: StoredDoc) => Record<string, unknown>> = {
  'practice-areas': (doc) => ({
    title: doc.title,
    shortLabel: doc.shortLabel,
    summary: doc.summary,
    homeSummary: doc.homeSummary,
    heroIntro: doc.heroIntro,
    image: idOrNull(doc.image),
    heroImages: idList(doc.heroImages),
    overview: doc.overview ?? null,
    coreServices: plainList(doc.coreServices, (item) => ({
      title: item.title,
      description: item.description,
    })),
    approach: approachOf(doc.approach),
    industries: idList(doc.industries),
    lead: idOrNull(doc.lead),
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
    instagramUrl: doc.instagramUrl ?? null,
    email: doc.email ?? null,
    cardBio: doc.cardBio ?? null,
    bio: doc.bio ?? null,
    quote: doc.quote ?? null,
    primaryPracticeArea: idOrNull(doc.primaryPracticeArea),
    practiceAreas: idList(doc.practiceAreas),
    education: educationOf(doc.education),
    memberships: Array.isArray(doc.memberships) ? doc.memberships : [],
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
    externalUrl: doc.externalUrl ?? null,
    document: idOrNull(doc.document),
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
  'recognition-directories': (doc) => ({
    name: doc.name,
    logo: idOrNull(doc.logo),
    heroSubtitle: doc.heroSubtitle ?? null,
    heroImages: idList(doc.heroImages),
  }),
  awards: (doc) => ({
    directory: idOrNull(doc.directory),
    title: doc.title,
    year: doc.year,
    badge: idOrNull(doc.badge),
    featuredOnHome: doc.featuredOnHome ?? false,
  }),
  industries: (doc) => ({ name: doc.name }),
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

/**
 * Which contract shape each collection serialises to.
 *
 * A mapped type rather than a union: the spec now types every operation to one
 * collection (ADR-033), so a call site that knows its collection gets the exact
 * shape back and never has to narrow.
 */
export interface AdminShapeByCollection {
  'practice-areas': PracticeAreaAdmin;
  people: PersonAdmin;
  insights: InsightAdmin;
  offices: OfficeAdmin;
  'recognition-directories': RecognitionDirectoryAdmin;
  awards: AwardAdmin;
  industries: IndustryAdmin;
  faqs: FaqAdmin;
  jobs: JobAdmin;
}

export function toAdminContent<C extends AdminCollection>(
  collection: C,
  doc: StoredDoc,
  expanded: Expanded
): AdminShapeByCollection[C] {
  const shaped = { ...meta(doc), ...shapers[collection](doc), _expanded: expanded };

  // The shaper for this collection produces exactly its schema; the cast says
  // which one, which only the caller's `collection` knows at compile time.
  return shaped as unknown as AdminShapeByCollection[C];
}
