import type { PaginationMeta } from '../types/api.js';

/**
 * Pagination arithmetic.
 *
 * An out-of-range page returns an empty list with correct meta rather than a
 * 404, so a stale bookmark or a deleted item never breaks a grid.
 */
export const toSkip = (page: number, pageSize: number): number => (page - 1) * pageSize;

export const toMeta = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});
