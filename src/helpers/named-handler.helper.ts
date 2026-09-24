import type { RequestHandler } from 'express';

/**
 * Gives a middleware built by a factory a stable name.
 *
 * A factory returns a closure, and a closure is anonymous on the Express router
 * stack. The route inventory in `tests/support/routes.ts` reads those names to
 * prove every admin route carries a guard, so an anonymous guard reads as no
 * guard at all — the exact failure the inventory exists to catch.
 *
 * A named function expression is not enough: one that shadows its factory gets
 * renamed by the bundler (`requireAuth` arrived as `requireAuth2` under Vitest).
 * Setting `name` explicitly survives any transform.
 */
export function namedHandler(name: string, handler: RequestHandler): RequestHandler {
  return Object.defineProperty(handler, 'name', { value: name });
}
