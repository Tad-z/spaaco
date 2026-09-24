import { Types } from 'mongoose';

/**
 * A stored document reduced to plain JSON values.
 *
 * `lean()` returns ObjectIds and Dates, which is right for the database and
 * wrong for everything downstream: a Zod schema expecting an id string sees an
 * object, and a section merged back into a document would carry a live
 * ObjectId into a comparison against a string the client sent. Converting once
 * at the edge of the service keeps both the validators and the serializers
 * working in one representation.
 */
export function toPlainJson(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlainJson);

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlainJson(item)]));
  }

  return value;
}
