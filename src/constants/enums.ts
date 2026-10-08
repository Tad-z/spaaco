import type {
  EmploymentType,
  InsightCategory,
  InsightFormat,
  LegacySource,
  LegalPageKey,
  LinkKind,
  MediaKind,
  PageKey,
  PersonRole,
  WorkMode,
} from '../types/api.js';

/**
 * Every enum the API exposes, with the label the UI shows.
 *
 * The value types come from the OpenAPI spec, so adding a value here that the
 * contract does not define — or forgetting a label — fails `npm run typecheck`
 * rather than reaching the frontend as an unrenderable value. Models and
 * validators read `values` from here; serializers read `labels`. Never inline
 * an enum array anywhere else.
 */

export const CONTENT_STATUSES = {
  values: ['draft', 'published'],
  labels: { draft: 'Draft', published: 'Published' },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

export type ContentStatus = (typeof CONTENT_STATUSES.values)[number];

export const PERSON_ROLES = {
  values: [
    'managing_partner',
    'partner',
    'associate_partner',
    'senior_associate',
    'associate',
    'trainee_associate',
  ] as const satisfies readonly PersonRole[],
  labels: {
    managing_partner: 'Managing Partner',
    partner: 'Partner',
    associate_partner: 'Associate Partner',
    senior_associate: 'Senior Associate',
    associate: 'Associate',
    trainee_associate: 'Trainee Associate',
  } satisfies Record<PersonRole, string>,
} as const;

export const INSIGHT_CATEGORIES = {
  values: [
    'firm_news',
    'articles',
    'insights',
    'regulatory_updates',
    'events',
    'pro_bono',
  ] as const satisfies readonly InsightCategory[],
  labels: {
    firm_news: 'Firm News',
    articles: 'Articles',
    insights: 'Insights',
    regulatory_updates: 'Regulatory Updates',
    events: 'Events',
    pro_bono: 'Pro Bono & Community Commitment',
  } satisfies Record<InsightCategory, string>,
} as const;

/**
 * Categories left out of every insight listing unless asked for by name.
 *
 * Pro bono stories are the Responsible Business page's grid, and the designs
 * show them nowhere else — not in "All insights & news", not in Home's Recent
 * Publications, not on a practice area or an attorney (ADR-049). One constant,
 * so the rule cannot be applied in four places and forgotten in a fifth.
 */
export const EXCLUDED_FROM_MAIN_LISTING: readonly InsightCategory[] = ['pro_bono'];

/** The listing tabs and the Insights & News nav dropdown: every category a listing shows. */
export const PUBLIC_INSIGHT_CATEGORIES: readonly InsightCategory[] =
  INSIGHT_CATEGORIES.values.filter((category) => !EXCLUDED_FROM_MAIN_LISTING.includes(category));

/** Systems content may be imported from, recorded on each imported record (ADR-059). */
export const LEGACY_SOURCES = {
  values: ['wordpress'] as const satisfies readonly LegacySource[],
  labels: { wordpress: 'WordPress' } satisfies Record<LegacySource, string>,
} as const;

export const INSIGHT_FORMATS = {
  values: ['article', 'video'] as const satisfies readonly InsightFormat[],
  labels: { article: 'Article', video: 'Video' } satisfies Record<InsightFormat, string>,
} as const;

export const EMPLOYMENT_TYPES = {
  values: [
    'full_time',
    'part_time',
    'contract',
    'internship',
    'nysc',
  ] as const satisfies readonly EmploymentType[],
  labels: {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    internship: 'Internship',
    nysc: 'NYSC',
  } satisfies Record<EmploymentType, string>,
} as const;

export const WORK_MODES = {
  values: ['onsite', 'hybrid', 'remote'] as const satisfies readonly WorkMode[],
  labels: { onsite: 'Onsite', hybrid: 'Hybrid', remote: 'Remote' } satisfies Record<
    WorkMode,
    string
  >,
} as const;

export const LINK_KINDS = {
  values: ['internal', 'external', 'action'] as const satisfies readonly LinkKind[],
  labels: { internal: 'Internal', external: 'External', action: 'Action' } satisfies Record<
    LinkKind,
    string
  >,
} as const;

/**
 * Where a stat's value comes from. Derived figures are recomputed on every read
 * so they cannot go stale (ADR-009).
 */
export const STAT_SOURCES = {
  values: [
    'manual',
    'computed:yearsSinceFounding',
    'computed:officeCount',
    'computed:practiceAreaCount',
  ],
  labels: {
    manual: 'Manual',
    'computed:yearsSinceFounding': 'Years since founding',
    'computed:officeCount': 'Number of offices',
    'computed:practiceAreaCount': 'Number of practice areas',
  },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

export type StatSource = (typeof STAT_SOURCES.values)[number];

export const PAGE_KEYS = {
  values: [
    'home',
    'about',
    'practice-areas',
    'people',
    'insights',
    'careers',
    'faq',
    'offices',
    'recognition',
    'responsible-business',
  ] as const satisfies readonly PageKey[],
  labels: {
    home: 'Home',
    about: 'About Us',
    'practice-areas': 'Practice Areas',
    people: 'Our People',
    insights: 'Insights & News',
    careers: 'Careers',
    faq: "FAQ's",
    offices: 'Our Offices',
    recognition: 'Recognition',
    'responsible-business': 'Responsible Business',
  } satisfies Record<PageKey, string>,
} as const;

export const LEGAL_PAGE_KEYS = {
  values: ['terms', 'privacy'] as const satisfies readonly LegalPageKey[],
  labels: { terms: 'Terms of Service', privacy: 'Privacy Policy' } satisfies Record<
    LegalPageKey,
    string
  >,
} as const;

/** Media library kinds: pictures, and PDF documents (ADR-053). */
export const MEDIA_KINDS = {
  values: ['image', 'document'] as const satisfies readonly MediaKind[],
  labels: { image: 'Image', document: 'Document' } satisfies Record<MediaKind, string>,
} as const;

export const USER_ROLES = {
  values: ['admin', 'editor', 'hr', 'business_dev'],
  labels: {
    admin: 'Administrator',
    editor: 'Editor',
    hr: 'HR',
    business_dev: 'Business Development',
  },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

export type UserRole = (typeof USER_ROLES.values)[number];

export const SUBMISSION_STATUSES = {
  values: ['new', 'in_review', 'closed'],
  labels: { new: 'New', in_review: 'In review', closed: 'Closed' },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

export const APPLICATION_STATUSES = {
  values: ['new', 'shortlisted', 'rejected', 'hired'],
  labels: { new: 'New', shortlisted: 'Shortlisted', rejected: 'Rejected', hired: 'Hired' },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

export const SCAN_STATUSES = {
  values: ['pending', 'clean', 'infected'],
  labels: { pending: 'Pending', clean: 'Clean', infected: 'Infected' },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };
