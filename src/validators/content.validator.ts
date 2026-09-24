import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import {
  EMPLOYMENT_TYPES,
  INSIGHT_CATEGORIES,
  INSIGHT_FORMATS,
  PERSON_ROLES,
  RECOGNITION_TABS,
  WORK_MODES,
} from '../constants/enums.js';
import { sanitizeRichText } from '../helpers/sanitize.helper.js';
import { objectId, objectIdRef, pagination, seoBasic, slug } from './common.validator.js';
import type { AdminCollection } from '../constants/content-collections.js';

/**
 * Write schemas for the seven content collections.
 *
 * Rich text is sanitised here, as part of validation, so a service never sees
 * unsanitised HTML and no write path can forget to call the sanitiser.
 *
 * Update schemas are the create schema made partial, which is what keeps an
 * admin GET body a valid PUT body: the same fields, none newly required.
 */

/** A rich-text field: sanitised on the way in. */
const richText = z
  .string()
  .max(50_000)
  .transform((value) => sanitizeRichText(value));

const nullableRichText = richText.nullable();

const text = (max: number): z.ZodString => z.string().trim().min(1).max(max);
const optionalText = (max: number): ZodTypeAny => z.string().trim().max(max).nullable();

const practiceAreaCreate = z
  .object({
    slug: slug.optional(),
    title: text(200),
    shortLabel: text(60),
    summary: text(1000),
    image: objectIdRef.optional(),
    body: nullableRichText.optional(),
    keyServices: z.array(z.string().trim().max(200)).max(30).optional(),
    contacts: z.array(objectId).max(20).optional(),
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
    photo: objectIdRef.optional(),
    linkedinUrl: optionalText(2048).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    bio: nullableRichText.optional(),
    quote: optionalText(600).optional(),
    practiceAreas: z.array(objectId).max(30).optional(),
    office: objectIdRef.optional(),
    featuredInLeadership: z.boolean().optional(),
  })
  .strict();

const insightBase = z
  .object({
    slug: slug.optional(),
    title: text(300),
    excerpt: optionalText(1000).optional(),
    body: nullableRichText.optional(),
    format: z.enum(INSIGHT_FORMATS.values),
    videoUrl: optionalText(2048).optional(),
    categories: z.array(z.enum(INSIGHT_CATEGORIES.values)).min(1).max(7),
    practiceAreas: z.array(objectId).max(30).optional(),
    author: objectIdRef.optional(),
    coverImage: objectIdRef.optional(),
    featured: z.boolean().optional(),
    publishedAt: z.string().datetime().nullable().optional(),
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

const insightCreate = insightBase.refine(
  (value) => value.format !== 'video' || Boolean(value.videoUrl),
  VIDEO_URL_ISSUE
);

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
    directionsUrl: optionalText(2048).optional(),
    phone: optionalText(40).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  })
  .strict();

const recognitionCreate = z
  .object({
    slug: slug.optional(),
    organization: text(160),
    title: text(160),
    year: z.number().int().min(1900).max(2200).nullable().optional(),
    badge: objectIdRef.optional(),
    url: optionalText(2048).optional(),
    tab: z.enum(RECOGNITION_TABS.values),
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
  .refine((value) => value.format !== 'video' || Boolean(value.videoUrl), VIDEO_URL_ISSUE);

export const CONTENT_CREATE_SCHEMAS: Record<AdminCollection, ZodTypeAny> = {
  'practice-areas': practiceAreaCreate,
  people: personCreate,
  insights: insightCreate,
  offices: officeCreate,
  recognitions: recognitionCreate,
  faqs: faqCreate,
  jobs: jobCreate,
};

export const CONTENT_UPDATE_SCHEMAS: Record<AdminCollection, ZodTypeAny> = {
  'practice-areas': practiceAreaCreate.partial().strict(),
  people: personCreate.partial().strict(),
  insights: insightUpdate,
  offices: officeCreate.partial().strict(),
  recognitions: recognitionCreate.partial().strict(),
  faqs: faqCreate.partial().strict(),
  jobs: jobCreate.partial().strict(),
};

export const adminCollectionParams = z.object({
  collection: z.enum([
    'practice-areas',
    'people',
    'insights',
    'offices',
    'recognitions',
    'faqs',
    'jobs',
  ]),
});

export const adminItemParams = adminCollectionParams.extend({ id: objectId });

export const listContentQuery = pagination.extend({
  status: z.enum(['draft', 'published']).optional(),
  q: z.string().trim().max(200).optional(),
});

export const reorderBody = z.object({ ids: z.array(objectId).min(1).max(500) });

export type ListContentQuery = z.infer<typeof listContentQuery>;
export type AdminItemParams = z.infer<typeof adminItemParams>;
