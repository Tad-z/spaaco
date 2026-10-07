import type {
  InsightCard,
  PersonDetail,
  PersonSummary,
  PracticeAreaLead,
  PracticeAreaLink,
} from '../types/api.js';
import type { IEducation, IPerson } from '../interfaces/person.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { PERSON_ROLES } from '../constants/enums.js';
import { toNullableImage } from './image.serializer.js';
import { toLink as practiceAreaLink } from './practice-area.serializer.js';
import type { PracticeAreaLinkSource } from './practice-area.serializer.js';
import { toRef as officeRef } from './office.serializer.js';
import type { OfficeRefSource } from './office.serializer.js';

/**
 * Attorney payloads.
 *
 * `displayName` and `roleLabel` are derived here rather than stored, so
 * renaming a role label never needs a data migration.
 *
 * Every summary carries the card's back face — `cardBio` and the practice-area
 * chips — because every person card flips (ADR-052).
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
  /** Shown instead of the role name when set (ADR-061). */
  jobTitle?: string | null;
  photo?: IMedia | null;
  linkedinUrl?: string | null;
  cardBio?: string | null;
  /** Populated chips. An unpopulated id reads as absent. */
  practiceAreas?: readonly unknown[];
}

export interface PersonDetailSource extends PersonSummarySource {
  instagramUrl?: string | null;
  email?: string | null;
  bio?: string | null;
  quote?: string | null;
  primaryPracticeArea?: PracticeAreaLinkSource | null;
  education?: IEducation | null;
  memberships?: string[];
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

/** The role's name, or the person's own title when one is set; a blank title counts as unset (ADR-061). */
export const toRoleLabel = (role: IPerson['role'], jobTitle?: string | null): string => {
  const title = jobTitle?.trim() ?? '';
  return title === '' ? PERSON_ROLES.labels[role] : title;
};

const isAreaLinkSource = (value: unknown): value is PracticeAreaLinkSource =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { slug?: unknown }).slug === 'string' &&
  typeof (value as { title?: unknown }).title === 'string';

/** The chips, from populated areas only: a draft area was already filtered out. */
const toChips = (areas: readonly unknown[] | undefined): PracticeAreaLink[] =>
  (areas ?? []).filter(isAreaLinkSource).map(practiceAreaLink);

export function toSummary(person: PersonSummarySource): PersonSummary {
  return {
    id: person._id.toString(),
    slug: person.slug,
    displayName: toDisplayName(person),
    role: person.role,
    roleLabel: toRoleLabel(person.role, person.jobTitle),
    photo: toNullableImage(person.photo),
    linkedinUrl: person.linkedinUrl ?? null,
    cardBio: person.cardBio ?? null,
    practiceAreas: toChips(person.practiceAreas),
  };
}

/** The "Practice Lead" card: a summary plus the address behind its email icon. */
export function toLead(person: PersonSummarySource & { email?: string | null }): PracticeAreaLead {
  return { ...toSummary(person), email: person.email ?? null };
}

export function toDetail(
  person: PersonDetailSource,
  recentPublications: InsightCard[] = []
): PersonDetail {
  return {
    ...toSummary(person),
    firstName: person.firstName,
    lastName: person.lastName,
    honorific: person.honorific ?? null,
    postNominals: person.postNominals ?? null,
    instagramUrl: person.instagramUrl ?? null,
    // Public since v2: the profile shows it (ADR-052).
    email: person.email ?? null,
    bio: person.bio ?? null,
    quote: person.quote ?? null,
    primaryPracticeArea: person.primaryPracticeArea
      ? practiceAreaLink(person.primaryPracticeArea)
      : null,
    education: {
      intro: person.education?.intro ?? null,
      entries: (person.education?.entries ?? []).map((entry) => ({
        qualification: entry.qualification,
        year: entry.year ?? null,
      })),
    },
    memberships: person.memberships ?? [],
    office: person.office ? officeRef(person.office) : null,
    recentPublications,
  };
}
