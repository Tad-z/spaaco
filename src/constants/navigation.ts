import type { LinkKind } from '../types/api.js';

/**
 * The main navigation skeleton.
 *
 * The six top-level entries live here rather than in a collection because the
 * site's navigation is fixed by the designs — the firm edits content, not
 * structure (ADR-004). Two entries have dropdowns, and neither is typed here
 * (ADR-050): About Us lists the anchors kept in settings, which the firm can
 * reword, and Insights & News lists the public insight categories.
 */
export interface NavEntry {
  readonly label: string;
  readonly href: string;
  readonly kind: LinkKind;
  /** Where this entry's dropdown comes from, if it has one. */
  readonly dropdown?: 'aboutAnchors' | 'insightCategories';
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { label: 'Home', href: '/', kind: 'internal' },
  { label: 'About Us', href: '/about', kind: 'internal', dropdown: 'aboutAnchors' },
  { label: 'Practice Areas', href: '/practice-areas', kind: 'internal' },
  { label: 'Our People', href: '/people', kind: 'internal' },
  {
    label: 'Insights & News',
    href: '/insights',
    kind: 'internal',
    dropdown: 'insightCategories',
  },
  { label: 'Careers', href: '/careers', kind: 'internal' },
] as const;
