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
    handler: (_req, _res, next) => {
      next(new RateLimitedError());
    },
  });

/** 300 per minute: generous, aimed at scrapers rather than real visitors. */
export const publicReadLimiter = build(RATE_LIMITS.publicRead);

/** 60 per minute: search is the most expensive public read. */
export const searchLimiter = build(RATE_LIMITS.search);

/** 5 per 10 minutes, per form. */
export const formLimiter = build(RATE_LIMITS.forms);

/** 5 per 15 minutes, to slow credential stuffing against the admin login. */
export const loginLimiter = build(RATE_LIMITS.login);
