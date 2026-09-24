import { Media, Person } from '../models/index.js';
import type { Expanded } from '../types/api.js';

/**
 * Builds the `_expanded` previews an admin payload carries.
 *
 * Two queries regardless of how many documents are being serialised, so a list
 * of 24 media-bearing records costs the same as one (ADR-014).
 */
export async function buildExpanded(
  mediaIds: readonly string[],
  personIds: readonly string[]
): Promise<Expanded> {
  if (mediaIds.length === 0 && personIds.length === 0) return {};

  const [media, people] = await Promise.all([
    mediaIds.length === 0
      ? []
      : Media.find({ _id: { $in: mediaIds } })
          .select('url alt')
          .lean<{ _id: { toString: () => string }; url: string; alt: string }[]>(),
    personIds.length === 0
      ? []
      : Person.find({ _id: { $in: personIds } })
          .select('honorific firstName lastName postNominals')
          .lean<
            {
              _id: { toString: () => string };
              honorific?: string | null;
              firstName: string;
              lastName: string;
              postNominals?: string | null;
            }[]
          >(),
  ]);

  const expanded: Expanded = {};

  for (const item of media) {
    expanded[item._id.toString()] = { kind: 'media', url: item.url, alt: item.alt };
  }

  for (const person of people) {
    // The same display rule the public payloads use: only "Dr." is kept.
    const prefix = person.honorific === 'Dr.' ? 'Dr. ' : '';
    const suffix = person.postNominals ? `, ${person.postNominals}` : '';

    expanded[person._id.toString()] = {
      kind: 'person',
      displayName: `${prefix}${person.firstName} ${person.lastName}${suffix}`,
    };
  }

  return expanded;
}
