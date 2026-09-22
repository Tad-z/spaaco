import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  isSlug,
  slugCandidate,
  slugify,
} from '../../../src/helpers/slug.helper.js';

describe('slugify', () => {
  it.each([
    ['Tax', 'tax'],
    ['Dispute Resolution & Arbitration', 'dispute-resolution-arbitration'],
    ['Corporate Finance & Capital Markets', 'corporate-finance-capital-markets'],
    ['Company Secretarial', 'company-secretarial'],
  ])('turns %j into %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('drops an apostrophe rather than splitting the word', () => {
    expect(slugify("Nigeria's Economy")).toBe('nigerias-economy');
  });

  it('handles the curly apostrophe editors paste from Word', () => {
    expect(slugify('Nigeria’s Economy')).toBe('nigerias-economy');
  });

  it('keeps a meaningful internal hyphen', () => {
    expect(slugify('Mini-Grid Regulation 2026')).toBe('mini-grid-regulation-2026');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Olóyè Adeyemi')).toBe('oloye-adeyemi');
  });

  it('collapses punctuation runs into one separator', () => {
    expect(slugify('Regulatory Update: The 2026 Practice Directions.')).toBe(
      'regulatory-update-the-2026-practice-directions'
    );
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  ...Tax...  ')).toBe('tax');
  });

  it('produces the slug the fixtures use for the longest insight title', () => {
    const title =
      'The Rural Electrification Agency, Renewable Electricity and the Mini-Grid Regulation 2026: Updates and Prospects for Investors.';

    expect(slugify(title)).toBe(
      'the-rural-electrification-agency-renewable-electricity-and-the-mini-grid-regulation-2026-updates-and-prospects-for-investors'
    );
  });

  it('returns an empty string when there is nothing usable, rather than inventing one', () => {
    expect(slugify('---')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });

  describe('length', () => {
    it('never exceeds the contract maximum', () => {
      const slug = slugify('word '.repeat(80));

      expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    });

    it('cuts at a word boundary rather than mid-word', () => {
      const slug = slugify('alpha bravo charlie delta echo foxtrot', 20);

      expect(slug).toBe('alpha-bravo-charlie');
    });

    it('never leaves a trailing hyphen after truncation', () => {
      const slug = slugify('alpha bravo charlie', 12);

      expect(slug.endsWith('-')).toBe(false);
    });

    it('falls back to a hard cut when the first word is itself too long', () => {
      const slug = slugify('supercalifragilistic', 10);

      expect(slug).toBe('supercalif');
    });

    it('always produces a valid slug', () => {
      for (const input of ['word '.repeat(80), 'alpha bravo charlie', "Nigeria's Economy"]) {
        expect(isSlug(slugify(input))).toBe(true);
      }
    });
  });
});

describe('isSlug', () => {
  it.each(['tax', 'dispute-resolution-arbitration', 'tax-2', 'a1-b2'])('accepts %j', (value) => {
    expect(isSlug(value)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['uppercase', 'Tax'],
    ['a leading hyphen', '-tax'],
    ['a trailing hyphen', 'tax-'],
    ['a double hyphen', 'tax--law'],
    ['a space', 'tax law'],
    ['an underscore', 'tax_law'],
    ['an over-long value', 'a'.repeat(MAX_SLUG_LENGTH + 1)],
  ])('rejects %s', (_label, value) => {
    expect(isSlug(value)).toBe(false);
  });
});

describe('slugCandidate', () => {
  it('returns the base slug for the first attempt', () => {
    expect(slugCandidate('tax', 1)).toBe('tax');
  });

  it('appends an incrementing suffix for later attempts', () => {
    expect(slugCandidate('tax', 2)).toBe('tax-2');
    expect(slugCandidate('tax', 3)).toBe('tax-3');
  });

  it('reserves room for the suffix instead of pushing past the limit', () => {
    const base = 'a'.repeat(MAX_SLUG_LENGTH);
    const candidate = slugCandidate(base, 10);

    expect(candidate.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(candidate.endsWith('-10')).toBe(true);
  });

  it('still produces a valid slug when it has to truncate', () => {
    const base = slugify('word '.repeat(80));

    expect(isSlug(slugCandidate(base, 12))).toBe(true);
  });
});
