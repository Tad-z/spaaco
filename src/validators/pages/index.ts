import type { ZodTypeAny } from 'zod';
import type { PageKey } from '../../types/api.js';
import { homePageSchema } from './home.validator.js';
import { aboutPageSchema } from './about.validator.js';
import { practiceAreasPageSchema } from './practice-areas.validator.js';
import { peoplePageSchema } from './people.validator.js';
import { insightsPageSchema } from './insights.validator.js';
import { careersPageSchema } from './careers.validator.js';
import { faqPageSchema } from './faq.validator.js';
import { officesPageSchema } from './offices.validator.js';
import { recognitionPageSchema } from './recognition.validator.js';
import { responsibleBusinessPageSchema } from './responsible-business.validator.js';

/**
 * Page key → the schema its stored document must satisfy.
 *
 * `Record<PageKey, …>` means adding a page key to the contract without adding
 * its schema fails typecheck. Admin PUT and PATCH both validate the *merged*
 * result against this, so a section-level patch cannot leave a page in a shape
 * the composers can't render (ADR-015).
 */
export const PAGE_SCHEMAS: Record<PageKey, ZodTypeAny> = {
  home: homePageSchema,
  about: aboutPageSchema,
  'practice-areas': practiceAreasPageSchema,
  people: peoplePageSchema,
  insights: insightsPageSchema,
  careers: careersPageSchema,
  faq: faqPageSchema,
  offices: officesPageSchema,
  recognition: recognitionPageSchema,
  'responsible-business': responsibleBusinessPageSchema,
};

export const schemaForPage = (key: PageKey): ZodTypeAny => PAGE_SCHEMAS[key];

export { homePageSchema } from './home.validator.js';
export { aboutPageSchema } from './about.validator.js';
export { practiceAreasPageSchema } from './practice-areas.validator.js';
export { peoplePageSchema } from './people.validator.js';
export { insightsPageSchema } from './insights.validator.js';
export { careersPageSchema } from './careers.validator.js';
export { faqPageSchema } from './faq.validator.js';
export { officesPageSchema } from './offices.validator.js';
export { recognitionPageSchema } from './recognition.validator.js';
export { responsibleBusinessPageSchema } from './responsible-business.validator.js';
