import { Types } from 'mongoose';
import type { IMedia } from '../../src/interfaces/media.interface.js';
import type { IPerson } from '../../src/interfaces/person.interface.js';
import type { IInsight } from '../../src/interfaces/insight.interface.js';
import type { IPracticeArea } from '../../src/interfaces/practice-area.interface.js';
import type { IOffice } from '../../src/interfaces/office.interface.js';
import type { PersonDetailSource } from '../../src/serializers/person.serializer.js';
import type { InsightDetailSource } from '../../src/serializers/insight.serializer.js';
import type { PracticeAreaDetailSource } from '../../src/serializers/practice-area.serializer.js';
import type { OfficeSource } from '../../src/serializers/office.serializer.js';

/**
 * Builders for test data.
 *
 * Each returns a complete, valid document, so a test names only the fields it
 * is actually about — `makePerson({ role: 'partner' })` reads as a statement of
 * intent rather than a wall of boilerplate.
 */

const id = (): Types.ObjectId => new Types.ObjectId();

const contentFields = (
  overrides: Partial<{ slug: string; status: 'draft' | 'published' }> = {}
) => ({
  slug: overrides.slug ?? 'a-slug',
  status: overrides.status ?? ('published' as const),
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
  order: 0,
  revision: 0,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

export function makeMedia(overrides: Partial<IMedia> = {}): IMedia & { _id: Types.ObjectId } {
  return {
    _id: id(),
    kind: 'image',
    provider: 'local',
    storageKey: 'seed/example-1200x900',
    url: 'https://placehold.co/1200x900?text=Example',
    sizes: {
      sm: 'https://placehold.co/480x360?text=Example',
      md: 'https://placehold.co/960x720?text=Example',
      lg: 'https://placehold.co/1440x1080?text=Example',
    },
    version: 1,
    width: 1200,
    height: 900,
    mimeType: 'image/jpeg',
    bytes: 102_400,
    originalFilename: 'example.jpg',
    title: 'Example',
    alt: 'An example image',
    revision: 0,
    focalPoint: { x: 0.5, y: 0.5 },
    uploadedBy: null,
    replacedBy: null,
    replacedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makePracticeArea(
  overrides: Partial<PracticeAreaDetailSource> = {}
): PracticeAreaDetailSource {
  return {
    _id: id(),
    ...contentFields({ slug: 'dispute-resolution-arbitration' }),
    title: 'Dispute Resolution & Arbitration',
    shortLabel: 'Dispute Resolution',
    summary: 'When a disagreement threatens to disrupt a business…',
    homeSummary: 'When a disagreement threatens to disrupt a business…',
    heroIntro: 'When a disagreement threatens to disrupt a business…',
    image: null,
    heroImages: [],
    overview: null,
    coreServices: [{ title: 'Litigation', description: 'Representing clients in court.' }],
    approach: null,
    industries: [],
    seo: { title: null, description: null },
    ...overrides,
  };
}

export function makeOffice(overrides: Partial<OfficeSource> = {}): OfficeSource {
  return {
    _id: id(),
    ...contentFields({ slug: 'lagos' }),
    name: 'Lagos',
    address: 'Suite 201, SPAACO House, 27A Macarthy Street, Onikan',
    hours: '8:00 AM to 4:00 PM, Monday to Friday',
    location: null,
    directionsUrl: null,
    phone: null,
    email: null,
    ...overrides,
  };
}

export function makePerson(overrides: Partial<PersonDetailSource> = {}): PersonDetailSource {
  return {
    _id: id(),
    ...contentFields({ slug: 'babatunde-ajibade' }),
    honorific: 'Dr.',
    firstName: 'Babatunde',
    lastName: 'Ajibade',
    postNominals: 'SAN',
    role: 'managing_partner',
    photo: null,
    linkedinUrl: null,
    instagramUrl: null,
    email: null,
    cardBio: null,
    bio: null,
    quote: null,
    primaryPracticeArea: null,
    practiceAreas: [],
    education: { intro: null, entries: [] },
    memberships: [],
    office: null,
    ...overrides,
  };
}

export function makeInsight(overrides: Partial<InsightDetailSource> = {}): InsightDetailSource {
  return {
    _id: id(),
    ...contentFields({ slug: 'an-insight' }),
    title: 'An insight',
    excerpt: null,
    body: null,
    format: 'article',
    videoUrl: null,
    externalUrl: null,
    document: null,
    categories: ['articles'],
    practiceAreas: [],
    author: null,
    coverImage: null,
    featured: false,
    ...overrides,
  };
}

/** A PDF from the library (ADR-053). */
export function makeDocumentMedia(
  overrides: Partial<IMedia> = {}
): IMedia & { _id: Types.ObjectId } {
  return makeMedia({
    kind: 'document',
    storageKey: 'seed/document-firm-profile',
    url: 'https://placehold.co/600x800?text=Firm%20profile',
    sizes: null,
    width: null,
    height: null,
    mimeType: 'application/pdf',
    bytes: 2048,
    originalFilename: 'firm-profile.pdf',
    title: 'SPA Ajibade & Co. firm profile',
    alt: null,
    focalPoint: null,
    ...overrides,
  });
}

/** Documents as the models return them, for database-backed tests. */
export const makePersonDoc = (overrides: Partial<IPerson> = {}): Partial<IPerson> => ({
  firstName: 'Ada',
  lastName: 'Nwosu',
  role: 'associate',
  ...overrides,
});

export const makeInsightDoc = (overrides: Partial<IInsight> = {}): Partial<IInsight> => ({
  title: 'An insight',
  format: 'article',
  categories: ['articles'],
  ...overrides,
});

export const makePracticeAreaDoc = (
  overrides: Partial<IPracticeArea> = {}
): Partial<IPracticeArea> => ({
  title: 'Tax',
  shortLabel: 'Tax',
  summary: 'When a business needs to understand or meet its tax obligations…',
  homeSummary: 'When a business needs to understand or meet its tax obligations…',
  heroIntro: 'When a business needs to understand or meet its tax obligations…',
  coreServices: [{ title: 'Tax Advisory', description: 'Advising on compliance.' }],
  ...overrides,
});

export const makeOfficeDoc = (overrides: Partial<IOffice> = {}): Partial<IOffice> => ({
  name: 'Lagos',
  address: 'Onikan',
  hours: '8:00 AM to 4:00 PM, Monday to Friday',
  ...overrides,
});
