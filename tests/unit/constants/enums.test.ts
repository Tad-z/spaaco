import { describe, expect, it } from 'vitest';
import {
  EMPLOYMENT_TYPES,
  INSIGHT_CATEGORIES,
  INSIGHT_FORMATS,
  LINK_KINDS,
  PAGE_KEYS,
  PERSON_ROLES,
  RECOGNITION_TABS,
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
  { name: 'RecognitionTab', constant: RECOGNITION_TABS },
  { name: 'LinkKind', constant: LINK_KINDS },
  { name: 'PageKey', constant: PAGE_KEYS },
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

describe('labels', () => {
  it('uses the wording from the designs', () => {
    expect(PERSON_ROLES.labels.managing_partner).toBe('Managing Partner');
    expect(PERSON_ROLES.labels.nysc_associate).toBe('NYSC Associate');
    expect(INSIGHT_CATEGORIES.labels.webinar_resources).toBe('Webinar Resources');
    expect(EMPLOYMENT_TYPES.labels.full_time).toBe('Full-time');
    expect(RECOGNITION_TABS.labels.recognized_by).toBe('Independently Recognized By');
  });
});
