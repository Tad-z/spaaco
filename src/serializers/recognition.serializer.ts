import type {
  Award,
  RecognitionDirectoryLink,
  RecognitionDirectoryPage,
  RecognitionDirectoryRef,
  RecognitionsOverview,
} from '../types/api.js';
import type { IAwardDoc, IRecognitionDirectoryDoc } from '../interfaces/populated.interface.js';
import type { IRecognitionDirectoryLabels } from '../interfaces/page.interface.js';
import { toImages, toNullableImage } from './image.serializer.js';
import { toLink } from './page.serializer.js';

/**
 * Recognition: the directories that rank the firm and the awards each gave
 * (ADR-056).
 */

export const toDirectoryLink = (
  directory: Pick<IRecognitionDirectoryDoc, 'name' | 'slug'>
): RecognitionDirectoryLink => ({ name: directory.name, slug: directory.slug });

export const toDirectoryRef = (directory: IRecognitionDirectoryDoc): RecognitionDirectoryRef => ({
  id: directory._id.toString(),
  name: directory.name,
  slug: directory.slug,
  logo: toNullableImage(directory.logo),
});

/**
 * An award, or null when its directory did not come back from the populate —
 * a draft directory takes its awards off the site with it.
 */
export function toAward(award: IAwardDoc): Award | null {
  if (award.directory === null) return null;

  return {
    id: award._id.toString(),
    title: award.title,
    year: award.year,
    badge: toNullableImage(award.badge),
    directory: toDirectoryLink(award.directory),
  };
}

export const toAwards = (awards: readonly IAwardDoc[]): Award[] =>
  awards.map(toAward).filter((award): award is Award => award !== null);

/** The two-tab recognition component. */
export const toOverview = (
  directories: readonly IRecognitionDirectoryDoc[],
  featured: readonly IAwardDoc[]
): RecognitionsOverview => ({
  directories: directories.map(toDirectoryRef),
  achievements: toAwards(featured),
});

/**
 * One directory's page: a hero titled with its name, its subtitle and slides,
 * and the CTAs every directory page shares, over its awards.
 */
export function toDirectoryPage(
  directory: IRecognitionDirectoryDoc,
  awards: readonly IAwardDoc[],
  labels: IRecognitionDirectoryLabels
): RecognitionDirectoryPage {
  return {
    directory: toDirectoryRef(directory),
    hero: {
      title: directory.name,
      subtitle: directory.heroSubtitle ?? null,
      images: toImages(directory.heroImages),
      primaryCta: toLink(labels.primaryCta),
      secondaryCta: toLink(labels.secondaryCta),
    },
    awardsEyebrow: labels.awardsEyebrow,
    awards: toAwards(awards),
  };
}
