import { describe, expect, it } from 'vitest';
import { resolveStatValue } from '../../../src/helpers/computed-stats.helper.js';

/**
 * Derived figures are recomputed on every read so they cannot go stale. The
 * practice-area branch has no seeded data exercising it, so it is covered here.
 */
const counts = { officeCount: 3, practiceAreaCount: 9, now: new Date('2026-01-01T00:00:00.000Z') };

describe('resolveStatValue', () => {
  it('computes years since founding from the current year, not the stored text', () => {
    expect(resolveStatValue('computed:yearsSinceFounding', '1+ Years', counts)).toBe('59+ Years');
  });

  it('rolls over on its own when the year changes', () => {
    const later = { ...counts, now: new Date('2027-01-01T00:00:00.000Z') };

    expect(resolveStatValue('computed:yearsSinceFounding', '59+ Years', later)).toBe('60+ Years');
  });

  it('computes the office count', () => {
    expect(resolveStatValue('computed:officeCount', 'wrong', counts)).toBe('3 Offices');
  });

  it('computes the practice area count', () => {
    expect(resolveStatValue('computed:practiceAreaCount', 'wrong', counts)).toBe('9 Areas');
  });

  it('leaves a manual value exactly as the firm typed it', () => {
    expect(resolveStatValue('manual', '700+ Matters', counts)).toBe('700+ Matters');
  });

  it('falls back to the stored value for a source it does not know', () => {
    expect(resolveStatValue('computed:somethingNew', '42', counts)).toBe('42');
  });
});
