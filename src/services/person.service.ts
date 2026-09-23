import type { PipelineStage, Types } from 'mongoose';
import { Person } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { listInsightsByAuthor } from './insight.service.js';
import type { IInsightDoc } from '../interfaces/populated.interface.js';
import { publishedFilter, publishedPopulate } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { ROLE_RANK } from '../config/constants.js';
import type { IPerson } from '../interfaces/person.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IOffice } from '../interfaces/office.interface.js';
import type { PersonRole } from '../types/api.js';

export type PersonWithPhoto = Omit<IPerson, 'photo'> & {
  _id: Types.ObjectId;
  photo: IMedia | null;
};

export type PersonDetailDoc = Omit<IPerson, 'photo' | 'practiceAreas' | 'office'> & {
  _id: Types.ObjectId;
  photo: IMedia | null;
  practiceAreas: (IPracticeArea & { _id: Types.ObjectId })[];
  office: (IOffice & { _id: Types.ObjectId }) | null;
};

export interface ListPeopleOptions extends PreviewOptions {
  readonly role?: PersonRole;
  readonly sort: 'seniority' | 'name_asc' | 'name_desc';
  readonly page: number;
  readonly pageSize: number;
}

/** Role values in seniority order, most senior first. */
const ROLE_ORDER: readonly string[] = [...PERSON_ROLES.values].sort(
  (a, b) => ROLE_RANK[a] - ROLE_RANK[b]
);

/**
 * The directory tabs are groups, not stored roles: the Partners tab includes
 * the managing partner, because the designs have no separate tab for them
 * (ADR-024).
 */
function roleFilter(role: PersonRole | undefined): Record<string, unknown> {
  if (role === undefined) return {};
  if (role === 'partner') return { role: { $in: ['managing_partner', 'partner'] } };
  return { role };
}

/**
 * Seniority sorts by role rank, then manual order, then last name.
 *
 * Mongo has no notion of our enum ordering, so the rank is derived in an
 * aggregation rather than stored on the document: storing it would need a
 * migration every time the ladder changes.
 */
export async function listPeople(
  options: ListPeopleOptions
): Promise<{ items: PersonWithPhoto[]; total: number }> {
  const match = { ...publishedFilter(options), ...roleFilter(options.role) };

  let sortStage: PipelineStage.Sort['$sort'] = { roleRank: 1, order: 1, lastName: 1 };
  if (options.sort === 'name_asc') sortStage = { lastName: 1, firstName: 1 };
  if (options.sort === 'name_desc') sortStage = { lastName: -1, firstName: -1 };

  const [items, total] = await Promise.all([
    Person.aggregate<PersonWithPhoto>([
      { $match: match },
      { $addFields: { roleRank: { $indexOfArray: [ROLE_ORDER, '$role'] } } },
      { $sort: sortStage },
      { $skip: toSkip(options.page, options.pageSize) },
      { $limit: options.pageSize },
      { $project: { roleRank: 0 } },
    ]).then((docs) => Person.populate<PersonWithPhoto>(docs, { path: 'photo' })),
    Person.countDocuments(match),
  ]);

  return { items, total };
}

export async function getPersonBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ person: PersonDetailDoc; insights: IInsightDoc[] }> {
  const person = await Person.findOne({ slug, ...publishedFilter(options) })
    .populate('photo')
    .populate(publishedPopulate('practiceAreas', options))
    .populate(publishedPopulate('office', options))
    .lean<PersonDetailDoc | null>();

  if (!person) throw new NotFoundError('Attorney');

  // Loaded here rather than by the controller, which calls one service method.
  const insights = await listInsightsByAuthor(person._id, options);

  return { person, insights };
}

/** People flagged for the Home leadership row. */
export async function listLeadership(options: PreviewOptions = {}): Promise<PersonWithPhoto[]> {
  return Person.find({ ...publishedFilter(options), featuredInLeadership: true })
    .populate('photo')
    .sort({ order: 1 })
    .lean<PersonWithPhoto[]>();
}

export async function getPersonById(
  id: Types.ObjectId,
  options: PreviewOptions = {}
): Promise<PersonWithPhoto | null> {
  return Person.findOne({ _id: id, ...publishedFilter(options) })
    .populate('photo')
    .lean<PersonWithPhoto | null>();
}
