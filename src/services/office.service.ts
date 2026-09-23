import type { Types } from 'mongoose';
import { Office } from '../models/index.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { IOffice } from '../interfaces/office.interface.js';

export type OfficeDoc = IOffice & { _id: Types.ObjectId };

/** Page order everywhere: Lagos, Abuja, Ibadan (DECISIONS conflict 5). */
export async function listOffices(options: PreviewOptions = {}): Promise<OfficeDoc[]> {
  return Office.find(publishedFilter(options)).sort({ order: 1, name: 1 }).lean<OfficeDoc[]>();
}
