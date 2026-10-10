/**
 * Limits, defaults and windows used across the API.
 *
 * These are deliberately not environment variables: they are contract-visible
 * numbers (page sizes, upload limits, result counts) that the OpenAPI spec and
 * the frontend already depend on, so changing one is a contract change.
 */

/**
 * The deployed application version, reported by `/health`.
 *
 * Kept here rather than imported from package.json, which sits outside
 * `rootDir` and would not resolve the same way in `dist/`. A unit test asserts
 * the two stay in step.
 */
export const APP_VERSION = '0.1.0';

export const PAGINATION = {
  /** The designs paginate the people and insights grids 9 per page. */
  defaultPageSize: 9,
  maxPageSize: 50,
  /** The admin media library shows a denser grid. */
  mediaPageSize: 24,
  defaultPage: 1,
} as const;

export const SEARCH = {
  minQueryLength: 2,
  maxQueryLength: 100,
  resultsPerGroup: 5,
} as const;

/** How many related/featured items each surface shows. */
export const CONTENT_LIMITS = {
  relatedInsights: 3,
  /** "Recent Publications" on an attorney's profile and a practice area's page. */
  recentPublications: 6,
  featuredInsights: 3,
  homeLatestInsights: 6,
} as const;

export const UPLOAD_LIMITS = {
  /** CVs: multer memory storage, checked by magic bytes, not extension. */
  cvMaxBytes: 5 * 1024 * 1024,
  cvMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  /** Library images. SVG is rejected because it can carry scripts (ADR-016). */
  imageMaxBytes: 10 * 1024 * 1024,
  imageMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  /** Library documents: PDFs only, such as the firm profile (ADR-053). */
  documentMaxBytes: 20 * 1024 * 1024,
  documentMimeTypes: ['application/pdf'],
  /** JSON bodies. Page documents are the largest thing an editor submits. */
  jsonBodyLimit: '100kb',
} as const;

/** The three responsive widths every image is served at. */
export const IMAGE_SIZES = { sm: 480, md: 960, lg: 1440 } as const;

export const RATE_LIMITS = {
  /** Per IP, per form. */
  forms: { windowMs: 10 * 60 * 1000, max: 5 },
  search: { windowMs: 60 * 1000, max: 60 },
  publicRead: { windowMs: 60 * 1000, max: 300 },
  /** Per IP + email, to slow credential stuffing without locking out a shared NAT. */
  login: { windowMs: 15 * 60 * 1000, max: 5 },
} as const;

export const AUTH = {
  /** Failed logins before the account locks. */
  maxFailedLogins: 10,
  lockoutMs: 15 * 60 * 1000,
  /** Signed CV URLs are deliberately short-lived, and every use is audited. */
  signedUrlTtlSeconds: 5 * 60,
  refreshCookieName: 'spa_refresh',
  refreshCookiePath: '/api/v1/admin/auth',
} as const;

export const CACHE = {
  /** In-process LRU for composed pages and /site. */
  ttlMs: 5 * 60 * 1000,
  maxEntries: 200,
  /** Mirrors the Cache-Control header documented in docs/API.md. */
  publicMaxAgeSeconds: 60,
  publicSharedMaxAgeSeconds: 300,
  publicStaleWhileRevalidateSeconds: 600,
} as const;

/** Role rank for the directory's seniority sort (0 is most senior). */
export const ROLE_RANK = {
  managing_partner: 0,
  partner: 1,
  executive: 2,
  associate_partner: 3,
  senior_associate: 4,
  associate: 5,
  trainee_associate: 6,
  // Last until the firm says where consultants sit (ADR-068).
  consultant: 7,
} as const;

/** The firm's founding year, used by the computed "years since founding" stat. */
export const FOUNDED_YEAR = 1967;

/** Prefixes for the reference codes returned by the three public forms. */
export const REFERENCE_PREFIXES = {
  enquiry: 'ENQ',
  message: 'MSG',
  application: 'APP',
} as const;
