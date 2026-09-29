import { describe, expect, it } from 'vitest';
import {
  toImages,
  toNullableDocument,
  toNullableImage,
} from '../../../src/serializers/image.serializer.js';
import {
  toDisplayName,
  toLead,
  toSummary,
  toDetail as personDetail,
} from '../../../src/serializers/person.serializer.js';
import {
  FIRM_AUTHOR,
  toBackLink,
  toCard,
  toChips,
  toCta,
  toDetail as insightDetail,
  toDetailCta,
} from '../../../src/serializers/insight.serializer.js';
import {
  toCard as practiceAreaCard,
  toDetail as practiceAreaDetail,
  toHomeCard,
  toLink as practiceAreaLink,
  toRef as practiceAreaRef,
} from '../../../src/serializers/practice-area.serializer.js';
import { toOffice } from '../../../src/serializers/office.serializer.js';
import { formatErrors, getValidator, SPEC_ID } from '../../support/spec.js';
import {
  makeDocumentMedia,
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
    const image = toNullableImage(makeMedia());

    validate('Image', image);
    expect(image?.sizes.sm).toContain('480');
  });

  it('never exposes the internal storage key', () => {
    const image = toNullableImage(makeMedia({ storageKey: 'private/secret-path.jpg' }));

    expect(JSON.stringify(image)).not.toContain('secret-path');
  });

  it('never renders a PDF as a picture, and never a picture as a PDF', () => {
    // Writes refuse the wrong kind (ADR-053); this is the second line.
    expect(toNullableImage(makeDocumentMedia())).toBeNull();
    expect(toNullableDocument(makeMedia())).toBeNull();
  });

  it('produces the Document shape, with no sizes and no alt', () => {
    const document = toNullableDocument(makeDocumentMedia());

    validate('Document', document);
    expect(document).toEqual({
      url: 'https://placehold.co/600x800?text=Firm%20profile',
      title: 'SPA Ajibade & Co. firm profile',
      bytes: 2048,
      mimeType: 'application/pdf',
    });
  });

  it('keeps a carousel to the slides that are real images, in order', () => {
    const first = makeMedia({ url: 'https://placehold.co/1x1?text=first' });
    const second = makeMedia({ url: 'https://placehold.co/1x1?text=second' });

    const slides = toImages([first, null, makeDocumentMedia(), second]);

    expect(slides.map((slide) => slide.url)).toEqual([first.url, second.url]);
    expect(toImages(undefined)).toEqual([]);
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

  it('carries the card back: the italic line and the practice-area chips', () => {
    const summary = toSummary(
      makePerson({ cardBio: 'A well-regarded authority.', practiceAreas: [makePracticeArea()] })
    );

    validate('PersonSummary', summary);
    expect(summary.cardBio).toBe('A well-regarded authority.');
    expect(summary.practiceAreas).toEqual([
      { slug: 'dispute-resolution-arbitration', title: 'Dispute Resolution & Arbitration' },
    ]);
  });

  it('drops a chip whose practice area did not populate (a draft), rather than half-rendering it', () => {
    const unpopulated = { _id: 'x' } as unknown as ReturnType<typeof makePracticeArea>;

    expect(toSummary(makePerson({ practiceAreas: [unpopulated] })).practiceAreas).toEqual([]);
  });

  it.each([
    [
      'keeps Dr. and appends post-nominals',
      { honorific: 'Dr.', postNominals: 'SAN' },
      'Dr. Babatunde Ajibade, SAN',
    ],
    [
      'keeps Dr. without post-nominals',
      { honorific: 'Dr.', postNominals: null },
      'Dr. Babatunde Ajibade',
    ],
    ['omits Mr., as the cards do', { honorific: 'Mr.', postNominals: null }, 'Babatunde Ajibade'],
    ['omits Mrs.', { honorific: 'Mrs.', postNominals: null }, 'Babatunde Ajibade'],
    ['handles no honorific at all', { honorific: null, postNominals: null }, 'Babatunde Ajibade'],
  ])('%s', (_label, overrides, expected) => {
    expect(toDisplayName(makePerson(overrides))).toBe(expected);
  });

  it('derives the role label from the enum', () => {
    expect(toSummary(makePerson({ role: 'trainee_associate' })).roleLabel).toBe(
      'Trainee Associate'
    );
  });

  it('shows the email on the profile and the lead card, but not on a plain card (ADR-052)', () => {
    const person = makePerson({ email: 'b.ajibade@spaajibade.com' });

    expect(personDetail(person).email).toBe('b.ajibade@spaajibade.com');
    expect(toLead(person).email).toBe('b.ajibade@spaajibade.com');
    validate('PracticeAreaLead', toLead(person));
    // A directory card has no email icon, so its summary has no email field.
    expect(JSON.stringify(toSummary(person))).not.toContain('b.ajibade@spaajibade.com');
  });

  it('produces the PersonDetail shape with its references expanded', () => {
    const detail = personDetail(
      makePerson({
        practiceAreas: [makePracticeArea()],
        primaryPracticeArea: makePracticeArea(),
        education: { intro: null, entries: [{ qualification: 'LL.B.', year: 1988 }] },
        memberships: ['Nigerian Bar Association (NBA)'],
        office: makeOffice(),
      })
    );

    validate('PersonDetail', detail);
    expect(detail.practiceAreas).toHaveLength(1);
    expect(detail.primaryPracticeArea?.slug).toBe('dispute-resolution-arbitration');
    expect(detail.education.entries).toEqual([{ qualification: 'LL.B.', year: 1988 }]);
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
        makeInsight({ categories: ['events', 'firm_news'], practiceAreas: [] })
      );

      expect(chips).toEqual(['Events', 'Firm News']);
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

  describe('the link after the body (ADR-051)', () => {
    it('reads "Read Article" to the external URL', () => {
      expect(toDetailCta(makeInsight({ externalUrl: 'https://example.com/brief' }))).toEqual({
        label: 'Read Article',
        url: 'https://example.com/brief',
      });
    });

    it('reads "Read Article" to the uploaded PDF', () => {
      const document = makeDocumentMedia();

      expect(toDetailCta(makeInsight({ document }))).toEqual({
        label: 'Read Article',
        url: document.url,
      });
    });

    it('is absent for an article with neither', () => {
      expect(toDetailCta(makeInsight())).toBeNull();
    });

    it('does not treat an image in the document slot as a PDF', () => {
      expect(toDetailCta(makeInsight({ document: makeMedia() }))).toBeNull();
    });

    it('reads "Watch Video" to the video', () => {
      const cta = toDetailCta(
        makeInsight({ format: 'video', videoUrl: 'https://youtube.com/watch?v=1' })
      );

      expect(cta).toEqual({ label: 'Watch Video', url: 'https://youtube.com/watch?v=1' });
    });
  });

  it('sends a pro bono story back to Responsible Business, and anything else to the listing', () => {
    expect(toBackLink(makeInsight({ categories: ['pro_bono'] }))).toEqual({
      label: 'Back to Pro Bono & Community Commitment',
      href: '/responsible-business',
      kind: 'internal',
    });
    expect(toBackLink(makeInsight({ categories: ['articles'] })).href).toBe('/insights');
  });
});

describe('practice area serializer', () => {
  it('produces the ref and card shapes', () => {
    validate('PracticeAreaRef', practiceAreaRef(makePracticeArea()));
    validate('PracticeAreaCard', practiceAreaCard(makePracticeArea({ image: makeMedia() })));
  });

  it('puts the Home text on a Home card and the grid text on a grid card (ADR-047)', () => {
    const area = makePracticeArea({ summary: 'Grid text.', homeSummary: 'Home text.' });

    expect(practiceAreaCard(area).summary).toBe('Grid text.');
    expect(toHomeCard(area).summary).toBe('Home text.');
  });

  it('produces the PracticeAreaDetail shape', () => {
    const area = makePracticeArea({
      heroImages: [makeMedia()],
      approach: { text: 'Our approach.', points: ['One point'] },
      industries: [{ name: 'Oil & Gas', slug: 'oil-gas' }],
    });

    const detail = practiceAreaDetail(area, toLead(makePerson()), [practiceAreaLink(area)], []);

    validate('PracticeAreaDetail', detail);
    expect(detail.industries).toEqual([{ name: 'Oil & Gas', slug: 'oil-gas' }]);
    expect(detail.heroImages).toHaveLength(1);
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
