import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { zodIssueDetails } from '../../../src/helpers/zod-issues.helper.js';

/**
 * These `path` strings are what the dashboard uses to mark the field that
 * needs fixing, so they are worth pinning directly rather than only through
 * whichever endpoint happens to produce them.
 */

const schema = z
  .object({
    hero: z.object({ title: z.string().min(1) }).strict(),
    order: z.number(),
  })
  .strict();

const detailsFor = (value: unknown, prefix?: string): { path: string; message: string }[] => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected the value to be invalid');

  return zodIssueDetails(result.error, prefix);
};

describe('zodIssueDetails', () => {
  it('names the field with a dotted path', () => {
    const details = detailsFor({ hero: { title: '' }, order: 1 });

    expect(details).toEqual([
      { path: 'hero.title', message: expect.stringContaining('at least 1') },
    ]);
  });

  it('names each unrecognised key rather than its parent', () => {
    const details = detailsFor({ hero: { title: 'x' }, order: 1, hreo: {}, stats: {} });

    expect(details.map((detail) => detail.path)).toEqual(['hreo', 'stats']);
  });

  it('names an unrecognised key nested inside a section', () => {
    const details = detailsFor({ hero: { title: 'x', subtitle: 'y' }, order: 1 });

    expect(details.map((detail) => detail.path)).toEqual(['hero.subtitle']);
  });

  it('applies the prefix the middleware passes for a body or query', () => {
    const details = detailsFor({ hero: { title: '' }, order: 1 }, 'body');

    expect(details[0]?.path).toBe('body.hero.title');
  });
});
