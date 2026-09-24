import type { LinkKind } from '../types/api.js';

/**
 * The main navigation skeleton.
 *
 * Labels and order live here rather than in a collection because the site's
 * navigation is fixed by the designs — the firm edits content, not structure
 * (ADR-004). The Practice Areas dropdown is the exception: its children are
 * generated from the practice areas collection, so adding an area adds a menu
 * entry with no code change.
 */
export interface NavEntry {
  readonly label: string;
  readonly href: string;
  readonly kind: LinkKind;
  /** Fill this dropdown from the practice areas collection. */
  readonly practiceAreaDropdown?: boolean;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { label: 'Home', href: '/', kind: 'internal' },
  { label: 'About Us', href: '/about', kind: 'internal' },
  {
    label: 'Practice Areas',
    href: '/practice-areas',
    kind: 'internal',
    practiceAreaDropdown: true,
  },
  { label: 'Our People', href: '/people', kind: 'internal' },
  { label: 'Insights & News', href: '/insights', kind: 'internal' },
  { label: 'Careers', href: '/careers', kind: 'internal' },
  { label: "FAQ's", href: '/faq', kind: 'internal' },
  { label: 'Our Offices', href: '/offices', kind: 'internal' },
] as const;
