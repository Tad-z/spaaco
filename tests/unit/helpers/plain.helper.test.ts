import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { toPlainJson } from '../../../src/helpers/plain.helper.js';

/**
 * The conversion the singleton merge depends on. An ObjectId left in place
 * fails its own schema on the way back in, and the failure looks like a
 * validation bug in the page rather than a leftover from `lean()`.
 */

describe('toPlainJson', () => {
  it('converts ids and dates at any depth', () => {
    const id = new Types.ObjectId();

    const result = toPlainJson({
      hero: { image: id, title: 'Tax' },
      items: [{ badge: id }, { badge: null }],
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(result).toEqual({
      hero: { image: id.toHexString(), title: 'Tax' },
      items: [{ badge: id.toHexString() }, { badge: null }],
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('leaves plain values alone, including null and empty structures', () => {
    expect(toPlainJson({ a: null, b: [], c: {}, d: 0, e: false })).toEqual({
      a: null,
      b: [],
      c: {},
      d: 0,
      e: false,
    });
  });

  it('produces something JSON.stringify would not change again', () => {
    const value = toPlainJson({ id: new Types.ObjectId(), at: new Date(0) });

    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
