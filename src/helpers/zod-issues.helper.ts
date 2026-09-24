import type { ZodError } from 'zod';
import type { ErrorDetail } from '../types/api.js';

/**
 * Zod issues in the contract's `details` shape.
 *
 * Shared by the validation middleware and by the singleton services, which
 * validate a *merged* document rather than a request body. Both must produce
 * the same `path` strings, because the dashboard uses them to mark the field
 * that needs fixing — a section patch that reported `0.title` instead of
 * `hero.title` would highlight nothing.
 */
export function zodIssueDetails(error: ZodError, prefix?: string): ErrorDetail[] {
  return error.issues.flatMap((issue) => {
    const at = (path: string): string =>
      prefix !== undefined && path !== '' ? `${prefix}.${path}` : path || (prefix ?? '');

    const path = issue.path.join('.');

    // Zod reports every unrecognised key in one issue whose own path is the
    // *parent* object, so the detail would point at the whole body. Splitting
    // it gives the dashboard the field to highlight, which for a page section
    // is the difference between "something is wrong" and "you typed `hreo`".
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: at(path === '' ? key : `${path}.${key}`),
        message: 'unrecognized key',
      }));
    }

    return [{ path: at(path), message: issue.message }];
  });
}
