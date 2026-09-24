import { z } from 'zod';

/**
 * The only module that reads `process.env` (enforced by ESLint).
 *
 * Everything else imports the frozen `config` object, so configuration is
 * validated exactly once, at startup, and a missing or malformed variable is a
 * readable crash rather than an `undefined` surfacing somewhere far away.
 */

const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * Placeholder values shipped in `.env.example`. They are fine for local work and
 * must never reach a deployed environment, so production rejects them by name.
 */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-change-me-change-me-32',
  '0'.repeat(64),
]);

/** Trim, then treat an empty string as "not set" so a blank `.env` line is absent, not "". */
const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const commaSeparated = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
  );

const envSchema = z.object({
  // --- runtime ---
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: commaSeparated.default('http://localhost:3000,http://localhost:3001'),

  // --- database ---
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),

  // --- auth ---
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().trim().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(14),
  ENCRYPTION_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  IP_HASH_SALT: z.string().min(16, 'IP_HASH_SALT must be at least 16 characters'),

  // --- integration drivers ---
  STORAGE_PUBLIC_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  /** Where the local image driver writes. Served at /uploads outside production. */
  UPLOAD_DIR: z.string().trim().min(1).default('./.uploads'),
  STORAGE_PRIVATE_DRIVER: z.enum(['local', 's3']).default('local'),
  MAILER_DRIVER: z.enum(['log', 'resend', 'smtp']).default('log'),
  CAPTCHA_DRIVER: z.enum(['noop', 'turnstile']).default('noop'),
  VIRUS_SCAN_DRIVER: z.enum(['noop', 'clamav']).default('noop'),
  REVALIDATE_DRIVER: z.enum(['noop', 'http']).default('noop'),

  // --- integration credentials (each required only by its own driver) ---
  CLOUDINARY_URL: optionalString,
  S3_BUCKET_PRIVATE: optionalString,
  S3_REGION: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  SMTP_URL: optionalString,
  MAIL_FROM: z.string().trim().min(1).default('SPA Ajibade & Co. <no-reply@spaajibade.com>'),
  TURNSTILE_SECRET_KEY: optionalString,
  CLAMAV_HOST: optionalString,
  CLAMAV_PORT: z.coerce.number().int().positive().max(65535).default(3310),
  FRONTEND_REVALIDATE_URL: optionalString,
  FRONTEND_REVALIDATE_SECRET: optionalString,

  // --- notifications and retention ---
  NOTIFY_ENQUIRIES_TO: z.string().email().default('frontoffice@spaajibade.com'),
  NOTIFY_APPLICATIONS_TO: z
    .string()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ADMIN_DASHBOARD_URL: z.string().url().default('http://localhost:3001'),
  RETENTION_ENQUIRY_DAYS: z.coerce.number().int().positive().max(3650).default(730),
  RETENTION_APPLICATION_DAYS: z.coerce.number().int().positive().max(3650).default(365),

  // --- observability ---
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SENTRY_DSN: optionalString,
});

/** Each driver that needs credentials, and the variables it cannot run without. */
const DRIVER_REQUIREMENTS = [
  { field: 'STORAGE_PUBLIC_DRIVER', driver: 'cloudinary', requires: ['CLOUDINARY_URL'] },
  {
    field: 'STORAGE_PRIVATE_DRIVER',
    driver: 's3',
    requires: ['S3_BUCKET_PRIVATE', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
  },
  { field: 'MAILER_DRIVER', driver: 'resend', requires: ['RESEND_API_KEY'] },
  { field: 'MAILER_DRIVER', driver: 'smtp', requires: ['SMTP_URL'] },
  { field: 'CAPTCHA_DRIVER', driver: 'turnstile', requires: ['TURNSTILE_SECRET_KEY'] },
  { field: 'VIRUS_SCAN_DRIVER', driver: 'clamav', requires: ['CLAMAV_HOST'] },
  {
    field: 'REVALIDATE_DRIVER',
    driver: 'http',
    requires: ['FRONTEND_REVALIDATE_URL', 'FRONTEND_REVALIDATE_SECRET'],
  },
] as const;

const SECRETS_CHECKED_IN_PRODUCTION = [
  'JWT_ACCESS_SECRET',
  'ENCRYPTION_KEY',
  'IP_HASH_SALT',
] as const;

const refinedSchema = envSchema.superRefine((value, ctx) => {
  // A driver selected without its credentials fails here rather than on the
  // first request that happens to need it.
  for (const { field, driver, requires } of DRIVER_REQUIREMENTS) {
    if (value[field] !== driver) continue;
    for (const key of requires) {
      if (value[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when ${field} is "${driver}"`,
        });
      }
    }
  }

  if (value.NODE_ENV !== 'production') return;

  // The local image driver writes files that only the dev static mount serves,
  // and stamps their URLs onto media records permanently. Booting production on
  // it would fill the database with URLs that 404 for ever, so it is refused at
  // startup rather than discovered on the first upload.
  if (value.STORAGE_PUBLIC_DRIVER === 'local') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STORAGE_PUBLIC_DRIVER'],
      message: 'STORAGE_PUBLIC_DRIVER must be "cloudinary" in production; "local" is dev only',
    });
  }

  for (const key of SECRETS_CHECKED_IN_PRODUCTION) {
    if (PLACEHOLDER_SECRETS.has(value[key].toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} still holds the .env.example placeholder; generate a real secret`,
      });
    }
  }
});

export type Config = Readonly<z.infer<typeof refinedSchema>>;

export class ConfigError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Parse an environment bag into a frozen config.
 *
 * Exported separately from `config` so tests can exercise success and failure
 * without mutating the real `process.env`.
 *
 * @throws {ConfigError} listing every problem at once, not just the first.
 */
export function parseEnv(source: Record<string, string | undefined>): Config {
  const result = refinedSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }

  return Object.freeze(result.data);
}

export const config: Config = parseEnv(process.env);

export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
