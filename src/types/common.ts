import type { Types } from 'mongoose';

/**
 * Small shared types that aren't part of the API contract.
 * Anything the frontend sees comes from `types/api.ts` instead.
 */

/** A lean Mongoose document: plain data, with `_id` still an ObjectId. */
export type Lean<T> = T & { _id: Types.ObjectId };

/** A service result that carries its pagination counts alongside the rows. */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * The request data left behind by `validate()`.
 *
 * Each part is `unknown` because the shape depends on the route's schemas.
 * Controllers read them through the typed accessors in
 * `middlewares/validate.middleware.ts` rather than casting at the call site.
 */
export interface ValidatedData {
  readonly body: unknown;
  readonly query: unknown;
  readonly params: unknown;
}
