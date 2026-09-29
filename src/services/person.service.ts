import type { PipelineStage, Types } from 'mongoose';
import { Person, PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { listInsightsByAuthor } from './insight.service.js';
import type {
  IInsightDoc,
  IPersonDetailDoc,
  IPersonWithPhoto,
} from '../interfaces/populated.interface.js';
import {
  personCardFields,
  publishedFilter,
  publishedPopulate,
} from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { ROLE_RANK } from '../config/constants.js';
import type { PersonRole } from '../types/api.js';

export type PersonWithPhoto = IPersonWithPhoto;

export interface ListPeopleOptions extends PreviewOptions {
  readonly role?: PersonRole;
  /** A practice area slug: the directory's "Practice Area" dropdown (ADR-054). */
  readonly practiceArea?: string;
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
 * The practice-area filter matches the card's chips or the profile's primary
 * area (ADR-054). `undefined` means no filter; `null` means the slug names no
 * area, which is an empty page rather than a 404 — the value comes from a
 * dropdown.
 */
async function practiceAreaFilter(
  slug: string | undefined
): Promise<Record<string, unknown> | null | undefined> {
  if (slug === undefined) return undefined;

  const area = await PracticeArea.findOne({ slug })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();
  if (!area) return null;

  return { $or: [{ practiceAreas: area._id }, { primaryPracticeArea: area._id }] };
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
  const areaFilter = await practiceAreaFilter(options.practiceArea);
  if (areaFilter === null) return { items: [], total: 0 };

  const match = { ...publishedFilter(options), ...roleFilter(options.role), ...areaFilter };

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
    ]).then((docs) => Person.populate<PersonWithPhoto>(docs, personCardFields(options))),
    Person.countDocuments(match),
  ]);

  return { items, total };
}

export async function getPersonBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ person: IPersonDetailDoc; insights: IInsightDoc[] }> {
  const person = await Person.findOne({ slug, ...publishedFilter(options) })
    .populate(personCardFields(options))
    .populate({
      ...publishedPopulate('primaryPracticeArea', options),
      select: 'slug title shortLabel',
    })
    .populate(publishedPopulate('office', options))
    .lean<IPersonDetailDoc | null>();

  if (!person) throw new NotFoundError('Attorney');

  // Loaded here rather than by the controller, which calls one service method.
  const insights = await listInsightsByAuthor(person._id, options);

  return { person, insights };
}

/** People flagged for the Home leadership row, with their card backs. */
export async function listLeadership(options: PreviewOptions = {}): Promise<PersonWithPhoto[]> {
  return Person.find({ ...publishedFilter(options), featuredInLeadership: true })
    .populate(personCardFields(options))
    .sort({ order: 1 })
    .lean<PersonWithPhoto[]>();
}
