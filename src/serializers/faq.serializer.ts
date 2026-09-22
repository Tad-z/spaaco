import type { Faq } from '../types/api.js';

export interface FaqSource {
  _id: { toString: () => string };
  question: string;
  answer: string;
}

export const toFaq = (faq: FaqSource): Faq => ({
  id: faq._id.toString(),
  question: faq.question,
  answer: faq.answer,
});
