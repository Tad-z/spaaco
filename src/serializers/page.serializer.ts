import type {
  FilterOption,
  Hero,
  IconItem,
  Link,
  PersonRoleFilter,
  SectionHeader,
  Seo,
  Stat,
} from '../types/api.js';
import type { IIconItem, ILink } from '../interfaces/common.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import { INSIGHT_CATEGORIES, PUBLIC_INSIGHT_CATEGORIES } from '../constants/enums.js';
import { resolveStatValue } from '../helpers/computed-stats.helper.js';
import type { StatCounts } from '../helpers/computed-stats.helper.js';
import { toImages, toNullableImage } from './image.serializer.js';

/**
 * The building blocks every page composer shares.
 *
 * Nullable fields are emitted as explicit `null` rather than omitted, because
 * the contract marks them required-and-nullable: a missing key and a null
 * value are different things to a typed client.
 */

export const toLink = (link: ILink | null | undefined): Link | null =>
  link ? { label: link.label, href: link.href, kind: link.kind } : null;

export interface HeroSource {
  title: string;
  subtitle?: string | null;
  /** Carousel slides; only the image changes between them (ADR-046). */
  images?: (IMedia | null)[];
  primaryCta?: ILink | null;
  secondaryCta?: ILink | null;
}

export const toHero = (hero: HeroSource | null | undefined): Hero | null =>
  hero
    ? {
        title: hero.title,
        subtitle: hero.subtitle ?? null,
        images: toImages(hero.images),
        primaryCta: toLink(hero.primaryCta),
        secondaryCta: toLink(hero.secondaryCta),
      }
    : null;

export interface SeoSource {
  title?: string | null;
  description?: string | null;
  ogImage?: IMedia | null;
}

export const toSeo = (seo: SeoSource | null | undefined): Seo => ({
  title: seo?.title ?? null,
  description: seo?.description ?? null,
  ogImage: toNullableImage(seo?.ogImage),
});

export interface SectionHeaderSource {
  eyebrow?: string | null;
  title: string;
  cta?: ILink | null;
}

export const toSectionHeader = (section: SectionHeaderSource): SectionHeader => ({
  eyebrow: section.eyebrow ?? null,
  title: section.title,
  cta: toLink(section.cta),
});

export const toIconItem = (item: IIconItem): IconItem => ({
  icon: item.icon,
  title: item.title,
  text: item.text ?? null,
});

export interface StatSource {
  value: string;
  caption: string;
  label: string;
  source: string;
}

/** `source` is admin-only; the public payload carries the resolved value. */
export const toStat = (stat: StatSource, counts: StatCounts): Stat => ({
  value: resolveStatValue(stat.source, stat.value, counts),
  caption: stat.caption,
  label: stat.label,
});

/**
 * Filter tabs. An empty `value` means "no filter", which is how the designs'
 * "All insights & news" tab behaves. The People page has no such tab: its
 * first tab, Management, is the default (ADR-068).
 */
export const ROLE_FILTERS: readonly (FilterOption & { value: PersonRoleFilter })[] = [
  { value: 'management', label: 'Management' },
  { value: 'partner', label: 'Partners' },
  { value: 'associate', label: 'Associates' },
  { value: 'consultant', label: 'Consultants' },
];

/** The public tabs: `pro_bono` is the Responsible Business grid, not a tab (ADR-049). */
export const CATEGORY_FILTERS: readonly FilterOption[] = [
  { value: '', label: 'All insights & news' },
  ...PUBLIC_INSIGHT_CATEGORIES.map((value) => ({
    value,
    label: INSIGHT_CATEGORIES.labels[value],
  })),
];
