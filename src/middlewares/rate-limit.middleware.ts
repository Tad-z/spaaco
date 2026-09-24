import rateLimit from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { RATE_LIMITS } from '../config/constants.js';
import { RateLimitedError } from '../core/errors.js';

/**
 * Per-IP rate limits.
 *
 * Limits are handed to the error middleware rather than answered here, so a
 * 429 has the same body shape as every other error the API returns.
 */
const build = (config: { windowMs: number; max: number }): RateLimitRequestHandler =>
  rateLimit({
    windowMs: config.windowMs,
    limit: config.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // One switch for every limiter, set by createApp. A test file makes more
    // requests in a second than a real client makes in a window, so the suite
    // turns them off — except in the test that is about the limiter itself.
    skip: (req) => req.app.get('rateLimitEnabled') === false,
    handler: (_req, _res, next) => {
      next(new RateLimitedError());
    },
  });

/** 300 per minute: generous, aimed at scrapers rather than real visitors. */
export const publicReadLimiter = build(RATE_LIMITS.publicRead);

/** 60 per minute: search is the most expensive public read. */
export const searchLimiter = build(RATE_LIMITS.search);

/** 5 per 10 minutes, per form. */
/**
 * One limiter per form, not one shared by all three.
 *
 * `express-rate-limit` keys by IP within a single instance, so a single shared
 * instance gave a visitor five requests per ten minutes *across* enquiries,
 * messages and applications together — someone who sends a message and then
 * applies for a job would have been counted against one budget.
 */
export const enquiryLimiter = build(RATE_LIMITS.forms);
export const messageLimiter = build(RATE_LIMITS.forms);
export const applicationLimiter = build(RATE_LIMITS.forms);

/** 5 per 15 minutes, to slow credential stuffing against the admin login. */
export const loginLimiter = build(RATE_LIMITS.login);
