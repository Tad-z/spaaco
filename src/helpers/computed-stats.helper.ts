import { FOUNDED_YEAR } from '../config/constants.js';

/**
 * Resolves the About page's derived figures.
 *
 * Years since founding and the office count are computed on every read rather
 * than stored, so they cannot go stale: nobody has to remember to edit "58+
 * Years" in January (ADR-009). Stats with `source: 'manual'` keep whatever the
 * firm typed.
 */

export interface StatCounts {
  readonly officeCount: number;
  readonly practiceAreaCount: number;
  /** Injectable so the test does not change meaning each new year. */
  readonly now?: Date;
}

export function resolveStatValue(source: string, stored: string, counts: StatCounts): string {
  switch (source) {
    case 'computed:yearsSinceFounding': {
      const year = (counts.now ?? new Date()).getUTCFullYear();
      return `${String(year - FOUNDED_YEAR)}+ Years`;
    }
    case 'computed:officeCount':
      return `${String(counts.officeCount)} Offices`;
    case 'computed:practiceAreaCount':
      return `${String(counts.practiceAreaCount)} Areas`;
    default:
      return stored;
  }
}
