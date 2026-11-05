import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import {
  EMPLOYMENT_TYPES,
  INSIGHT_CATEGORIES,
  INSIGHT_FORMATS,
  LEGACY_SOURCES,
  PERSON_ROLES,
  WORK_MODES,
} from '../constants/enums.js';
import {
  mediaIdList,
  objectId,
  objectIdRef,
  pagination,
  richText as richTextOf,
  safeUrl,
  seoBasic,
  slug,
} from './common.validator.js';
import { ADMIN_COLLECTIONS } from '../constants/content-collections.js';
import type { AdminCollection } from '../constants/content-collections.js';

/**
 * Write schemas for the nine content collections.
 *
 * Rich text is sanitised here, as part of validation, so a service never sees
 * unsanitised HTML and no write path can forget to call the sanitiser.
 *
 * Update schemas are the create schema made partial, which is what keeps an
 * admin GET body a valid PUT body: the same fields, none newly required.
 */

/** A rich-text field: sanitised on the way in. */
const richText = richTextOf();

const nullableRichText = richText.nullable();

const text = (max: number): z.ZodString => z.string().trim().min(1).max(max);
const optionalText = (max: number): ZodTypeAny => z.string().trim().max(max).nullable();

/**
 * Marks a write as part of a one-off content import (ADR-059). Admins only:
 * the service refuses it from anyone else. An insight may also carry the date
 * it was first published, which no other write can set.
 */
const legacyImport = z
  .object({
    source: z.enum(LEGACY_SOURCES.values),
    legacyId: z.number().int().min(1),
  })
  .strict();

const insightLegacyImport = legacyImport
  .extend({ publishedAt: z.string().datetime({ offset: true }).optional() })
  .strict();

const practiceAreaCreate = z
  .object({
    slug: slug.optional(),
    title: text(200),
    shortLabel: text(60),
    // Three texts, because the designs show three (ADR-047).
    summary: text(1000),
    homeSummary: text(1000),
    heroIntro: text(1000),
    image: objectIdRef.optional(),
    heroImages: mediaIdList.optional(),
    overview: optionalText(3000).optional(),
    coreServices: z
      .array(z.object({ title: text(160), description: text(600) }).strict())
      .min(1)
      .max(6),
    approach: z
      .object({ text: text(1500), points: z.array(text(300)).max(10) })
      .strict()
      .nullable()
      .optional(),
    industries: z.array(objectId).max(20).optional(),
    lead: objectIdRef.optional(),
    featuredOnHome: z.boolean().optional(),
    homeOrder: z.number().int().min(0).max(100).nullable().optional(),
    showInFooter: z.boolean().optional(),
    seo: seoBasic.optional(),
  })
  .strict();

const personCreate = z
  .object({
    slug: slug.optional(),
    honorific: optionalText(20).optional(),
    firstName: text(80),
    lastName: text(80),
    postNominals: optionalText(40).optional(),
    role: z.enum(PERSON_ROLES.values),
    jobTitle: optionalText(80).optional(),
    photo: objectIdRef.optional(),
    linkedinUrl: safeUrl.nullable().optional(),
    instagramUrl: safeUrl.nullable().optional(),
    // Public since v2 (ADR-052).
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    cardBio: optionalText(400).optional(),
    bio: nullableRichText.optional(),
    quote: optionalText(600).optional(),
    primaryPracticeArea: objectIdRef.optional(),
    practiceAreas: z.array(objectId).max(30).optional(),
    education: z
      .object({
        intro: optionalText(2000),
        entries: z
          .array(
            z
              .object({
                qualification: text(300),
                year: z.number().int().min(1900).max(2200).nullable(),
              })
              .strict()
          )
          .max(20),
      })
      .strict()
      .optional(),
    memberships: z.array(text(200)).max(30).optional(),
    publications: z
      .array(
        z
          .object({
            title: text(300),
            date: optionalText(40),
            label: optionalText(120),
            insight: objectIdRef,
          })
          .strict()
      )
      .max(50)
      .optional(),
    office: objectIdRef.optional(),
    featuredInLeadership: z.boolean().optional(),
    legacyImport: legacyImport.optional(),
  })
  .strict();

/** Exactly one of `person` and `name`; a photo only goes with a name (ADR-064). */
const coAuthor = z
  .object({
    person: objectIdRef.optional(),
    name: optionalText(120).optional(),
    photo: objectIdRef.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.person) !== Boolean(value.name), {
    path: ['name'],
    message: 'a co-author names exactly one of person and name',
  })
  .refine((value) => !(value.photo && value.person), {
    path: ['photo'],
    message: 'a photo goes with a name; an attorney uses their profile photo',
  });

const insightBase = z
  .object({
    slug: slug.optional(),
    title: text(300),
    excerpt: optionalText(1000).optional(),
    body: nullableRichText.optional(),
    format: z.enum(INSIGHT_FORMATS.values),
    videoUrl: safeUrl.nullable().optional(),
    externalUrl: safeUrl.nullable().optional(),
    document: objectIdRef.optional(),
    // One category: an insight sits in one tab (ADR-069).
    categories: z.array(z.enum(INSIGHT_CATEGORIES.values)).length(1),
    practiceAreas: z.array(objectId).max(30).optional(),
    author: objectIdRef.optional(),
    authorName: optionalText(120).optional(),
    authorPhoto: objectIdRef.optional(),
    coAuthors: z.array(coAuthor).max(8).optional(),
    coverImage: objectIdRef.optional(),
    featured: z.boolean().optional(),
    // No `publishedAt`: it is stamped by POST /publish and is read-only in the
    // contract, so accepting it here would let a client backdate an article
    // out of band of the only action that is audited. The one exception is an
    // admin's `legacyImport.publishedAt`, audited on the write (ADR-059).
    legacyImport: insightLegacyImport.optional(),
  })
  .strict();

/**
 * The model enforces this too, but catching it here gives the editor a field
 * path rather than a Mongoose validation message. Written inline on each
 * schema because Zod infers the argument type from the schema it is attached
 * to, and a shared callback would have to be typed against both.
 */
const VIDEO_URL_ISSUE: z.CustomErrorParams = {
  path: ['videoUrl'],
  message: 'videoUrl is required when format is "video"',
};

/** "Read Article" goes to one place: an external URL or an uploaded PDF (ADR-051). */
const ONE_TARGET_ISSUE: z.CustomErrorParams = {
  path: ['document'],
  message: 'set either externalUrl or document, not both',
};

/** An insight credits an attorney's profile or names a writer, not both (ADR-060). */
const ONE_AUTHOR_ISSUE: z.CustomErrorParams = {
  path: ['authorName'],
  message: 'set either author or authorName, not both',
};

/** An attorney shows their profile photo; `authorPhoto` is the named writer's (ADR-064). */
const AUTHOR_PHOTO_ISSUE: z.CustomErrorParams = {
  path: ['authorPhoto'],
  message: "authorPhoto is the named writer's photo; an attorney uses their profile photo",
};

const insightCreate = insightBase
  .refine((value) => value.format !== 'video' || Boolean(value.videoUrl), VIDEO_URL_ISSUE)
  .refine((value) => !(value.externalUrl && value.document), ONE_TARGET_ISSUE)
  .refine((value) => !(value.author && value.authorName), ONE_AUTHOR_ISSUE)
  .refine((value) => !(value.author && value.authorPhoto), AUTHOR_PHOTO_ISSUE);

const officeCreate = z
  .object({
    slug: slug.optional(),
    name: text(80),
    address: text(400),
    hours: text(200),
    location: z
      .object({
        type: z.literal('Point'),
        // GeoJSON order, which is the reverse of how people say it.
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      })
      .strict()
      .nullable()
      .optional(),
    directionsUrl: safeUrl.nullable().optional(),
    phone: optionalText(40).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  })
  .strict();

const recognitionDirectoryCreate = z
  .object({
    slug: slug.optional(),
    name: text(160),
    logo: objectIdRef.optional(),
    heroSubtitle: optionalText(600).optional(),
    heroImages: mediaIdList.optional(),
  })
  .strict();

const awardCreate = z
  .object({
    slug: slug.optional(),
    directory: objectId,
    title: text(200),
    year: z.number().int().min(1900).max(2200),
    badge: objectIdRef.optional(),
    featuredOnHome: z.boolean().optional(),
  })
  .strict();

const industryCreate = z
  .object({
    slug: slug.optional(),
    name: text(120),
  })
  .strict();

const faqCreate = z
  .object({
    slug: slug.optional(),
    question: text(300),
    answer: richText,
  })
  .strict();

const jobCreate = z
  .object({
    slug: slug.optional(),
    title: text(200),
    practiceArea: objectIdRef.optional(),
    description: richText,
    experience: optionalText(200).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES.values),
    workMode: z.enum(WORK_MODES.values),
    office: objectIdRef.optional(),
    closingDate: z.string().datetime().nullable().optional(),
    isOpen: z.boolean().optional(),
  })
  .strict();

/** Partial of the base, with the same cross-field rule reapplied. */
const insightUpdate = insightBase
  .partial()
  .strict()
  .refine((value) => value.format !== 'video' || Boolean(value.videoUrl), VIDEO_URL_ISSUE)
  .refine((value) => !(value.externalUrl && value.document), ONE_TARGET_ISSUE)
  .refine((value) => !(value.author && value.authorName), ONE_AUTHOR_ISSUE)
  .refine((value) => !(value.author && value.authorPhoto), AUTHOR_PHOTO_ISSUE);

export const CONTENT_CREATE_SCHEMAS: Record<AdminCollection, ZodTypeAny> = {
  'practice-areas': practiceAreaCreate,
  people: personCreate,
  insights: insightCreate,
  offices: officeCreate,
  'recognition-directories': recognitionDirectoryCreate,
  awards: awardCreate,
  industries: industryCreate,
  faqs: faqCreate,
  jobs: jobCreate,
};

/**
 * An update must change something.
 *
 * `{}` would otherwise be a valid PATCH: it passes every partial schema,
 * consumes the `If-Match` revision, bumps it and invalidates the caches, all
 * for a write that changed nothing. The spec says `minProperties: 1` on every
 * `<Name>Update`, so this is what enforces it.
 */
const nonEmpty = (schema: ZodTypeAny): ZodTypeAny =>
  schema.refine((value) => Object.keys(value as object).length > 0, {
    message: 'at least one field is required',
  });

export const CONTENT_UPDATE_SCHEMAS: Record<AdminCollection, ZodTypeAny> = {
  'practice-areas': nonEmpty(practiceAreaCreate.partial().strict()),
  people: nonEmpty(personCreate.partial().strict()),
  insights: nonEmpty(insightUpdate),
  offices: nonEmpty(officeCreate.partial().strict()),
  'recognition-directories': nonEmpty(recognitionDirectoryCreate.partial().strict()),
  awards: nonEmpty(awardCreate.partial().strict()),
  industries: nonEmpty(industryCreate.partial().strict()),
  faqs: nonEmpty(faqCreate.partial().strict()),
  jobs: nonEmpty(jobCreate.partial().strict()),
};

export const adminCollectionParams = z.object({ collection: z.enum(ADMIN_COLLECTIONS) });

export const adminItemParams = adminCollectionParams.extend({ id: objectId });

export const listContentQuery = pagination.extend({
  status: z.enum(['draft', 'published']).optional(),
  q: z.string().trim().max(200).optional(),
});

export const reorderBody = z.object({ ids: z.array(objectId).min(1).max(500) });

export type ListContentQuery = z.infer<typeof listContentQuery>;
export type AdminItemParams = z.infer<typeof adminItemParams>;
