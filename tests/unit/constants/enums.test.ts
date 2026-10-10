import { describe, expect, it } from 'vitest';
import {
  EMPLOYMENT_TYPES,
  INSIGHT_CATEGORIES,
  INSIGHT_FORMATS,
  LEGAL_PAGE_KEYS,
  LINK_KINDS,
  MEDIA_KINDS,
  PAGE_KEYS,
  PERSON_ROLE_FILTERS,
  PERSON_ROLES,
  PUBLIC_INSIGHT_CATEGORIES,
  WORK_MODES,
} from '../../../src/constants/enums.js';
import { asObject, spec } from '../../support/spec.js';

/**
 * TypeScript already stops an enum gaining a value the spec does not define,
 * and `satisfies Record<T, string>` stops a label going missing. What neither
 * catches is the *reverse*: a value added to the spec and never added here,
 * which would ship as an unlabelled value the UI cannot render.
 *
 * So the lists are compared against openapi.yaml directly.
 */

const specEnum = (name: string): string[] => {
  const schema = asObject(asObject(asObject(spec.components)?.schemas)?.[name]);
  const values = schema?.enum;
  if (!Array.isArray(values)) {
    throw new Error(`openapi.yaml has no enum at components.schemas.${name}`);
  }
  return values.map(String);
};

const cases = [
  { name: 'PersonRole', constant: PERSON_ROLES },
  { name: 'InsightCategory', constant: INSIGHT_CATEGORIES },
  { name: 'InsightFormat', constant: INSIGHT_FORMATS },
  { name: 'EmploymentType', constant: EMPLOYMENT_TYPES },
  { name: 'WorkMode', constant: WORK_MODES },
  { name: 'LinkKind', constant: LINK_KINDS },
  { name: 'PageKey', constant: PAGE_KEYS },
  { name: 'LegalPageKey', constant: LEGAL_PAGE_KEYS },
  { name: 'MediaKind', constant: MEDIA_KINDS },
] as const;

describe('enums match the contract', () => {
  it.each(cases)('$name has exactly the values the spec declares', ({ name, constant }) => {
    expect([...constant.values].sort()).toEqual(specEnum(name).sort());
  });

  it.each(cases)('$name labels every value', ({ constant }) => {
    const labels: Record<string, string> = constant.labels;

    for (const value of constant.values) {
      expect(labels[value], `missing label for "${value}"`).toBeTruthy();
    }
    expect(Object.keys(labels)).toHaveLength(constant.values.length);
  });
});

describe('the directory tabs (ADR-068)', () => {
  it('accepts on ?role= exactly the values PersonRoleFilter declares', () => {
    expect([...PERSON_ROLE_FILTERS].sort()).toEqual(specEnum('PersonRoleFilter').sort());
  });
});

describe('labels', () => {
  it('uses the wording from the designs', () => {
    expect(PERSON_ROLES.labels.managing_partner).toBe('Managing Partner');
    expect(PERSON_ROLES.labels.trainee_associate).toBe('Trainee Associate');
    expect(INSIGHT_CATEGORIES.labels.pro_bono).toBe('Pro Bono & Community Commitment');
    expect(EMPLOYMENT_TYPES.labels.full_time).toBe('Full-time');
  });
});

describe('the pro bono rule (ADR-049)', () => {
  it('keeps pro_bono out of the public categories, and nothing else', () => {
    expect(PUBLIC_INSIGHT_CATEGORIES).not.toContain('pro_bono');
    expect(PUBLIC_INSIGHT_CATEGORIES).toHaveLength(INSIGHT_CATEGORIES.values.length - 1);
  });
});
