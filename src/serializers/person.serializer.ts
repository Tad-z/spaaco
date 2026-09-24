import type { PersonDetail, PersonSummary } from '../types/api.js';
import type { IPerson } from '../interfaces/person.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { InsightCard } from '../types/api.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { toNullableImage } from './image.serializer.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import type { PracticeAreaRefSource } from './practice-area.serializer.js';
import { toRef as officeRef } from './office.serializer.js';
import type { OfficeRefSource } from './office.serializer.js';

/**
 * Attorney payloads.
 *
 * `displayName` and `roleLabel` are derived here rather than stored, so
 * renaming a role label never needs a data migration.
 *
 * Email is never returned. The field exists because the firm may later choose
 * to publish it (DECISIONS Q9), and until they do it must not leak.
 */

/**
 * Structural minimums, not `Omit<IPerson, ...>`: a serializer should declare
 * exactly what it reads, so any query that supplies those fields satisfies it
 * regardless of how the rest of the document is shaped.
 */
export interface PersonSummarySource {
  _id: { toString: () => string };
  slug: string;
  honorific?: string | null;
  firstName: string;
  lastName: string;
  postNominals?: string | null;
  role: IPerson['role'];
  photo?: IMedia | null;
  linkedinUrl?: string | null;
}

export interface PersonDetailSource extends PersonSummarySource {
  bio?: string | null;
  quote?: string | null;
  practiceAreas?: PracticeAreaRefSource[];
  office?: OfficeRefSource | null;
}

/**
 * The designs show no honorific except "Dr.", so Mr./Mrs. are stored for the
 * About copy but omitted from the display name. Post-nominals are appended.
 */
export function toDisplayName(
  person: Pick<IPerson, 'honorific' | 'firstName' | 'lastName' | 'postNominals'>
): string {
  const prefix = person.honorific === 'Dr.' ? 'Dr. ' : '';
  const suffix = person.postNominals ? `, ${person.postNominals}` : '';
  return `${prefix}${person.firstName} ${person.lastName}${suffix}`;
}

export const toRoleLabel = (role: IPerson['role']): string => PERSON_ROLES.labels[role];

export function toSummary(person: PersonSummarySource): PersonSummary {
  return {
    id: person._id.toString(),
    slug: person.slug,
    displayName: toDisplayName(person),
    role: person.role,
    roleLabel: toRoleLabel(person.role),
    photo: toNullableImage(person.photo),
    linkedinUrl: person.linkedinUrl ?? null,
  };
}

export function toDetail(person: PersonDetailSource, insights: InsightCard[] = []): PersonDetail {
  return {
    ...toSummary(person),
    firstName: person.firstName,
    lastName: person.lastName,
    honorific: person.honorific ?? null,
    postNominals: person.postNominals ?? null,
    bio: person.bio ?? null,
    quote: person.quote ?? null,
    practiceAreas: (person.practiceAreas ?? []).map(practiceAreaRef),
    office: person.office ? officeRef(person.office) : null,
    insights,
  };
}
