import type {
  EmploymentType,
  InsightCategory,
  InsightFormat,
  LinkKind,
  PersonRole,
  RecognitionTab,
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
    'nysc_associate',
  ] as const satisfies readonly PersonRole[],
  labels: {
    managing_partner: 'Managing Partner',
    partner: 'Partner',
    associate_partner: 'Associate Partner',
    senior_associate: 'Senior Associate',
    associate: 'Associate',
    nysc_associate: 'NYSC Associate',
  } satisfies Record<PersonRole, string>,
} as const;

export const INSIGHT_CATEGORIES = {
  values: [
    'firm_news',
    'articles',
    'insights',
    'regulatory_updates',
    'news_updates',
    'media_coverage',
    'webinar_resources',
  ] as const satisfies readonly InsightCategory[],
  labels: {
    firm_news: 'Firm News',
    articles: 'Articles',
    insights: 'Insights',
    regulatory_updates: 'Regulatory Updates',
    news_updates: 'News Updates',
    media_coverage: 'Media Coverage',
    webinar_resources: 'Webinar Resources',
  } satisfies Record<InsightCategory, string>,
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

export const RECOGNITION_TABS = {
  values: ['achievements', 'recognized_by'] as const satisfies readonly RecognitionTab[],
  labels: {
    achievements: 'Our Achievements',
    recognized_by: 'Independently Recognized By',
  } satisfies Record<RecognitionTab, string>,
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
  values: ['home', 'about', 'practice-areas', 'people', 'insights', 'careers', 'faq', 'offices'],
  labels: {
    home: 'Home',
    about: 'About Us',
    'practice-areas': 'Practice Areas',
    people: 'Our People',
    insights: 'Insights & News',
    careers: 'Careers',
    faq: "FAQ's",
    offices: 'Our Offices',
  },
} as const satisfies { values: readonly string[]; labels: Record<string, string> };

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
