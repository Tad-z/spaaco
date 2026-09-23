import type { Types } from 'mongoose';
import { Faq } from '../models/index.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { IFaq } from '../interfaces/faq.interface.js';

export type FaqDoc = IFaq & { _id: Types.ObjectId };

export async function listFaqs(options: PreviewOptions = {}): Promise<FaqDoc[]> {
  return Faq.find(publishedFilter(options)).sort({ order: 1 }).lean<FaqDoc[]>();
}
