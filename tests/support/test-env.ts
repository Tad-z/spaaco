/**
 * The environment every test run boots with.
 *
 * `src/config/env.ts` validates `process.env` at import time, so these have to
 * be in place before any test file imports anything that reads config. That is
 * what `setup-env.ts` does, wired in through `vitest.config.ts` `setupFiles`.
 *
 * Every driver is the credential-free one, so the suite never needs a secret,
 * a network call or a real service.
 */
/** Exported separately so test helpers can sign tokens without an indexed lookup. */
export const TEST_ACCESS_SECRET = 'test-access-secret-test-access-secret-32';

export const TEST_ENV: Readonly<Record<string, string>> = Object.freeze({
  NODE_ENV: 'test',
  PORT: '4000',
  API_BASE_URL: 'http://localhost:4000',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',

  // Replaced per test file by setupTestDb() with the in-memory server's URI.
  MONGODB_URI: 'mongodb://127.0.0.1:27017/spa-ajibade-test',

  JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
  JWT_ACCESS_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '14',
  ENCRYPTION_KEY: 'a'.repeat(64),
  IP_HASH_SALT: 'test-ip-hash-salt-value',

  STORAGE_PUBLIC_DRIVER: 'local',
  // Written to by the real local driver, so uploads run the production path.
  UPLOAD_DIR: './.uploads-test',
  STORAGE_PRIVATE_DRIVER: 'local',
  PRIVATE_UPLOAD_DIR: './.private-uploads-test',
  MAILER_DRIVER: 'log',
  CAPTCHA_DRIVER: 'noop',
  VIRUS_SCAN_DRIVER: 'noop',
  REVALIDATE_DRIVER: 'noop',

  NOTIFY_ENQUIRIES_TO: 'frontoffice@example.test',
  ADMIN_DASHBOARD_URL: 'http://localhost:3001',
  RETENTION_ENQUIRY_DAYS: '730',
  RETENTION_APPLICATION_DAYS: '365',

  // Keep the suite output readable; individual tests attach their own logger spy.
  LOG_LEVEL: 'silent',
});

/** A minimal valid environment, for tests that exercise the parser directly. */
export const MINIMAL_VALID_ENV: Readonly<Record<string, string>> = Object.freeze({
  MONGODB_URI: 'mongodb://127.0.0.1:27017/spa-ajibade',
  JWT_ACCESS_SECRET: 'a-secret-that-is-at-least-32-chars-long',
  ENCRYPTION_KEY: 'b'.repeat(64),
  IP_HASH_SALT: 'a-salt-of-sufficient-length',
});
