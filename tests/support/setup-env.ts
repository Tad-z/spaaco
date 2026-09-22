import { TEST_ENV } from './test-env.js';

// Runs before any test module is imported, so src/config/env.ts sees a valid
// environment when it parses process.env at import time.
for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
