import { TEST_ENV } from './test-env.js';

// Runs before any test module is imported, so src/config/env.ts sees a valid
// environment when it parses process.env at import time.
for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}

/**
 * One upload directory per worker, the same way the database is partitioned.
 *
 * The local storage drivers write real files, and two test files running in
 * parallel workers shared one directory: the retention sweep's `beforeEach`
 * deleted the CV another worker's download test was about to fetch, so the
 * suite failed intermittently and only when the race happened to land.
 */
const worker = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';

process.env.UPLOAD_DIR = `${TEST_ENV.UPLOAD_DIR ?? './.uploads-test'}/w${worker}`;
process.env.PRIVATE_UPLOAD_DIR = `${TEST_ENV.PRIVATE_UPLOAD_DIR ?? './.private-uploads-test'}/w${worker}`;
