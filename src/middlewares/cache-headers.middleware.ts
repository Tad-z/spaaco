import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CACHE } from '../config/constants.js';

/**
 * Cache-Control and ETag for public GETs.
 *
 * The ETag is computed from the serialised body, so a conditional request can
 * be answered 304 without the client re-downloading an unchanged page. Preview
 * responses are never cached: a draft must not sit in a CDN.
 */

const PUBLIC_CACHE_CONTROL =
  `public, max-age=${String(CACHE.publicMaxAgeSeconds)}, ` +
  `s-maxage=${String(CACHE.publicSharedMaxAgeSeconds)}, ` +
  `stale-while-revalidate=${String(CACHE.publicStaleWhileRevalidateSeconds)}`;

const weakEtag = (body: string): string =>
  `W/"${createHash('sha1').update(body).digest('base64url')}"`;

export function cacheHeaders(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown): Response => {
    // Preview shows unpublished content to one authenticated user; caching it
    // anywhere shared would leak drafts to the public.
    if (req.preview) {
      res.setHeader('Cache-Control', 'no-store');
      return originalJson(body);
    }

    // Errors are not cacheable: a 404 now may be a 200 in a minute.
    if (res.statusCode >= 400) {
      res.setHeader('Cache-Control', 'no-store');
      return originalJson(body);
    }

    const payload = JSON.stringify(body);
    const etag = weakEtag(payload);

    res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson(body);
  };

  next();
}

/** Form POSTs and admin routes must never be cached. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
