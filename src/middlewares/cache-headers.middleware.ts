import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CACHE } from '../config/constants.js';

/**
 * Cache-Control and ETag for public GETs.
 *
 * The ETag is computed from the serialised body, so a conditional request can
 * be answered 304 without the client re-downloading an unchanged page.
 *
 * Three kinds of response are never cached: a preview, because a draft must
 * not sit in a CDN; an error, because a 404 now may be a 200 in a minute; and
 * anything a route has already marked `no-store`, which is every admin route
 * and every form POST.
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
    // Something upstream already said no-store, and it meant it.
    //
    // This is the important line in the file. `noStore` runs first in every
    // admin guard chain, but it only sets a header — and this wrapper runs at
    // `res.json()` time, after it, with `setHeader` replacing rather than
    // merging. Overwriting it served every admin payload, including enquiries
    // and applications, as `public, s-maxage=300`, which a CDN or a corporate
    // proxy would then hand to a caller with no token at all.
    if (res.getHeader('Cache-Control') === 'no-store') {
      return originalJson(body);
    }

    // Preview shows unpublished content to one authenticated user; caching it
    // anywhere shared would leak drafts to the public.
    //
    // The check is on the *query*, not on req.preview: a request that asked
    // for preview but failed to authenticate still returns published content,
    // and caching that under the ?preview=true URL would let a shared cache
    // answer the dashboard's real preview request from it.
    if (req.preview || req.query.preview === 'true') {
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
