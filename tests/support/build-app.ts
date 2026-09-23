import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { CreateAppOptions } from '../../src/app.js';

/**
 * Builds the real app for integration tests.
 *
 * Nothing about the stack is stubbed: tests drive the same middleware chain,
 * routes and error handling that production does. Integration boundaries
 * (mailer, storage, captcha, virus scan, revalidation) are swapped for their
 * credential-free drivers through options as those land.
 */
export function buildTestApp(options: CreateAppOptions = {}): Express {
  return createApp({
    corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    // A test file makes far more requests in a second than a real visitor
    // makes in a minute, so the limiter is off unless a test is about it.
    rateLimit: false,
    ...options,
  });
}
