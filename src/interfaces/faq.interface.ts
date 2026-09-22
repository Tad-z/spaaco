import type { IContentFields } from './common.interface.js';

/** One accordion item in the site-wide FAQ section. */
export interface IFaq extends IContentFields {
  question: string;
  /** Sanitised HTML. */
  answer: string;
}
