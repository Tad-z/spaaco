import { describe, expect, it } from 'vitest';
import { toImage, toNullableImage } from '../../../src/serializers/image.serializer.js';
import { toDisplayName, toSummary, toDetail as personDetail } from '../../../src/serializers/person.serializer.js';
import {
  FIRM_AUTHOR,
  toCard,
  toChips,
  toCta,
  toDetail as insightDetail,
} from '../../../src/serializers/insight.serializer.js';
import { toCard as practiceAreaCard, toRef as practiceAreaRef } from '../../../src/serializers/practice-area.serializer.js';
import { toOffice } from '../../../src/serializers/office.serializer.js';
import { formatErrors, getValidator, SPEC_ID } from '../../support/spec.js';
import {
  makeInsight,
  makeMedia,
  makeOffice,
  makePerson,
  makePracticeArea,
} from '../../support/factories.js';

/**
 * Serializers *are* the contract in code, so every output is validated against
 * the spec's own schema with ajv. TypeScript already checks the field names
 * and types; ajv additionally catches what it cannot — a value outside an
 * enum, a pattern violation, or an extra property slipping through a spread.
 */

const validate = (schema: string, value: unknown): void => {
  const check = getValidator(`${SPEC_ID}#/components/schemas/${schema}`);
  expect(check, `no schema ${schema} in the spec`).toBeDefined();
  if (!check) return;

  expect(check(value), `${schema}:\n${formatErrors(check.errors)}`).toBe(true);
};

describe('image serializer', () => {
  it('produces the Image shape the spec defines', () => {
    const image = toImage(makeMedia());

    validate('Image', image);
    expect(image.sizes.sm).toContain('480');
  });

  it('never exposes the internal storage key', () => {
    const image = toImage(makeMedia({ storageKey: 'private/secret-path.jpg' }));

    expect(JSON.stringify(image)).not.toContain('secret-path');
  });

  it('returns null for a missing image rather than a half-built object', () => {
    expect(toNullableImage(null)).toBeNull();
    expect(toNullableImage(undefined)).toBeNull();
    validate('NullableImage', toNullableImage(null));
  });

  it('treats an unpopulated reference as absent', () => {
    // What a forgotten .populate() leaves behind.
    const unpopulated = { _id: 'x' } as unknown as ReturnType<typeof makeMedia>;

    expect(toNullableImage(unpopulated)).toBeNull();
  });
});

describe('person serializer', () => {
  it('produces the PersonSummary shape', () => {
    validate('PersonSummary', toSummary(makePerson()));
  });

  it.each([
    ['keeps Dr. and appends post-nominals', { honorific: 'Dr.', postNominals: 'SAN' }, 'Dr. Babatunde Ajibade, SAN'],
    ['keeps Dr. without post-nominals', { honorific: 'Dr.', postNominals: null }, 'Dr. Babatunde Ajibade'],
    ['omits Mr., as the cards do', { honorific: 'Mr.', postNominals: null }, 'Babatunde Ajibade'],
    ['omits Mrs.', { honorific: 'Mrs.', postNominals: null }, 'Babatunde Ajibade'],
    ['handles no honorific at all', { honorific: null, postNominals: null }, 'Babatunde Ajibade'],
  ])('%s', (_label, overrides, expected) => {
    expect(toDisplayName(makePerson(overrides))).toBe(expected);
  });

  it('derives the role label from the enum', () => {
    expect(toSummary(makePerson({ role: 'nysc_associate' })).roleLabel).toBe('NYSC Associate');
  });

  it('never returns the attorney email, which is not public', () => {
    const person = makePerson({ email: 'private@spaajibade.com' });

    expect(JSON.stringify(toSummary(person))).not.toContain('private@spaajibade.com');
    expect(JSON.stringify(personDetail(person))).not.toContain('private@spaajibade.com');
  });

  it('produces the PersonDetail shape with its references expanded', () => {
    const detail = personDetail(
      makePerson({ practiceAreas: [makePracticeArea()], office: makeOffice() })
    );

    validate('PersonDetail', detail);
    expect(detail.practiceAreas).toHaveLength(1);
    expect(detail.office?.name).toBe('Lagos');
  });

  it('carries no seo block, which people do not have', () => {
    expect('seo' in personDetail(makePerson())).toBe(false);
  });
});

describe('insight serializer', () => {
  it('produces the InsightCard shape', () => {
    validate('InsightCard', toCard(makeInsight()));
  });

  it('attributes a null author to the firm, which is meaningful, not missing', () => {
    const card = toCard(makeInsight({ author: null }));

    expect(card.author).toEqual(FIRM_AUTHOR);
    validate('InsightAuthor', card.author);
  });

  it('attributes an authored insight to the person', () => {
    const card = toCard(makeInsight({ author: makePerson() }));

    expect(card.author).toMatchObject({ type: 'person' });
    validate('InsightAuthor', card.author);
  });

  it('treats an unpopulated author reference as the firm rather than crashing', () => {
    const unpopulated = { _id: 'x' } as unknown as ReturnType<typeof makePerson>;

    expect(toCard(makeInsight({ author: unpopulated })).author).toEqual(FIRM_AUTHOR);
  });

  it('gives a video insight the Watch Video call to action', () => {
    expect(toCta('video')).toEqual({ label: 'Watch Video', kind: 'watch_video' });
    expect(toCta('article')).toEqual({ label: 'Read More', kind: 'read_more' });
  });

  describe('chips', () => {
    it('shows the first category then the first practice area', () => {
      const chips = toChips(
        makeInsight({ categories: ['articles'], practiceAreas: [makePracticeArea()] })
      );

      expect(chips).toEqual(['Articles', 'Dispute Resolution & Arbitration']);
    });

    it('falls back to the second category when there is no practice area', () => {
      const chips = toChips(
        makeInsight({ categories: ['webinar_resources', 'firm_news'], practiceAreas: [] })
      );

      expect(chips).toEqual(['Webinar Resources', 'Firm News']);
    });

    it('shows one chip when there is neither a practice area nor a second category', () => {
      expect(toChips(makeInsight({ categories: ['articles'], practiceAreas: [] }))).toEqual([
        'Articles',
      ]);
    });

    it('never exceeds the two chips the card has room for', () => {
      const chips = toChips(
        makeInsight({
          categories: ['articles', 'firm_news', 'insights'],
          practiceAreas: [makePracticeArea(), makePracticeArea()],
        })
      );

      expect(chips).toHaveLength(2);
    });
  });

  it('serialises publishedAt as an ISO string', () => {
    const card = toCard(makeInsight());

    expect(card.publishedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('produces the InsightDetail shape with related cards', () => {
    const detail = insightDetail(makeInsight(), [toCard(makeInsight())]);

    validate('InsightDetail', detail);
    expect(detail.related).toHaveLength(1);
  });
});

describe('practice area serializer', () => {
  it('produces the ref and card shapes', () => {
    validate('PracticeAreaRef', practiceAreaRef(makePracticeArea()));
    validate('PracticeAreaCard', practiceAreaCard(makePracticeArea({ image: makeMedia() })));
  });
});

describe('office serializer', () => {
  it('produces the Office shape with a null location', () => {
    validate('Office', toOffice(makeOffice()));
  });

  it('converts GeoJSON [lng, lat] into { lat, lng }', () => {
    const office = toOffice(
      makeOffice({ location: { type: 'Point', coordinates: [3.4064, 6.4541] } })
    );

    expect(office.coordinates).toEqual({ lng: 3.4064, lat: 6.4541 });
    validate('Office', office);
  });
});
