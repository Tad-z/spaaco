import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Header clients may send to correlate their own logs with ours. */
const HEADER = 'x-request-id';

/** Accept a caller-supplied id only if it is short and printable ASCII. */
const isUsable = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  /^[\x20-\x7E]+$/.test(value);

/**
 * Give every request an id, echo it back, and default `preview` to off.
 *
 * `preview` starts false here rather than in the auth middleware, so a route
 * that forgets `optionalPreviewAuth` shows published content instead of
 * crashing on an undefined flag or, worse, leaking drafts.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get(HEADER);
  req.requestId = isUsable(incoming) ? incoming : randomUUID();
  req.preview = false;
  res.setHeader(HEADER, req.requestId);
  next();
}
