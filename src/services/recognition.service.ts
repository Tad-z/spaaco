import { Award, Page, RecognitionDirectory } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter, publishedPopulate } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { IAwardDoc, IRecognitionDirectoryDoc } from '../interfaces/populated.interface.js';
import type { IRecognitionDirectoryLabels } from '../interfaces/page.interface.js';

/**
 * Recognition directories and their awards (ADR-056).
 *
 * An award's directory is populated through `publishedPopulate`, so an award
 * under a draft directory comes back with a null directory and the serializer
 * drops it: unpublishing a directory takes its badges off Home too.
 */

/** Every published directory, in order: the About awards list and the "Recognized By" tab. */
export function listDirectories(options: PreviewOptions = {}): Promise<IRecognitionDirectoryDoc[]> {
  return RecognitionDirectory.find(publishedFilter(options))
    .populate('logo')
    .populate('heroImages')
    .sort({ order: 1, name: 1 })
    .lean<IRecognitionDirectoryDoc[]>();
}

/** The Home badges and the "Our Achievements" tab: awards flagged for Home, in order. */
export function listFeaturedAwards(options: PreviewOptions = {}): Promise<IAwardDoc[]> {
  return Award.find({ ...publishedFilter(options), featuredOnHome: true })
    .populate('badge')
    .populate({ ...publishedPopulate('directory', options), select: 'name slug' })
    .sort({ order: 1, _id: 1 })
    .lean<IAwardDoc[]>();
}

export async function getRecognitionsOverview(
  options: PreviewOptions = {}
): Promise<{ directories: IRecognitionDirectoryDoc[]; achievements: IAwardDoc[] }> {
  const [directories, achievements] = await Promise.all([
    listDirectories(options),
    listFeaturedAwards(options),
  ]);

  return { directories, achievements };
}

export interface DirectoryPageSources {
  readonly directory: IRecognitionDirectoryDoc;
  readonly awards: IAwardDoc[];
  readonly labels: IRecognitionDirectoryLabels;
}

/**
 * One directory's page: the directory, its published awards newest year first
 * (ties keep the firm's order), and the labels every directory page shares.
 */
export async function getDirectoryPage(
  slug: string,
  options: PreviewOptions = {}
): Promise<DirectoryPageSources> {
  const directory = await RecognitionDirectory.findOne({ slug, ...publishedFilter(options) })
    .populate('logo')
    .populate('heroImages')
    .lean<IRecognitionDirectoryDoc | null>();

  if (!directory) throw new NotFoundError('Recognition directory');

  const [awards, page] = await Promise.all([
    Award.find({ ...publishedFilter(options), directory: directory._id })
      .populate('badge')
      .populate({ ...publishedPopulate('directory', options), select: 'name slug' })
      .sort({ year: -1, order: 1, _id: 1 })
      .lean<IAwardDoc[]>(),
    Page.findOne({ key: 'recognition' })
      .select('directoryPage')
      .lean<{ directoryPage?: IRecognitionDirectoryLabels | null } | null>(),
  ]);

  // The labels are the site's own structure; a missing document is a fault in
  // the deployment, not a page that does not exist.
  const labels = page?.directoryPage;
  if (!labels) throw new NotFoundError('Page');

  return { directory, awards, labels };
}
