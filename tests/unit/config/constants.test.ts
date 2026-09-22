import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, PAGINATION, SEARCH, UPLOAD_LIMITS } from '../../../src/config/constants.js';
import { ROOT } from '../../support/spec.js';

describe('APP_VERSION', () => {
  it('matches the version in package.json', () => {
    const pkg: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ version: APP_VERSION });
  });
});

describe('contract-visible defaults', () => {
  it('matches the page sizes documented in the spec', () => {
    expect(PAGINATION.defaultPageSize).toBe(9);
    expect(PAGINATION.maxPageSize).toBe(50);
  });

  it('matches the search bounds documented in the spec', () => {
    expect(SEARCH.minQueryLength).toBe(2);
    expect(SEARCH.maxQueryLength).toBe(100);
    expect(SEARCH.resultsPerGroup).toBe(5);
  });

  it('caps CV uploads at the documented 5 MB', () => {
    expect(UPLOAD_LIMITS.cvMaxBytes).toBe(5 * 1024 * 1024);
  });

  it('rejects SVG from the image allow-list, which can carry scripts', () => {
    expect(UPLOAD_LIMITS.imageMimeTypes).not.toContain('image/svg+xml');
  });
});
