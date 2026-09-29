import type {
  Link,
  NavItem,
  Site,
  SiteFaqSection,
  SiteFooter,
  SiteSettings,
  Socials,
} from '../types/api.js';
import type { ILink } from '../interfaces/common.interface.js';
import type { ISettings } from '../interfaces/settings.interface.js';
import type { ISiteFaq, ISiteSources } from '../interfaces/site.interface.js';
import { NAV_ENTRIES } from '../constants/navigation.js';
import type { NavEntry } from '../constants/navigation.js';
import { INSIGHT_CATEGORIES, PUBLIC_INSIGHT_CATEGORIES } from '../constants/enums.js';
import { toFaq } from './faq.serializer.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import { toFooterOffice } from './office.serializer.js';

/**
 * The global shell.
 *
 * The frontend fetches this once and reuses it on every page, which is why the
 * FAQ section, contact callout and footer are deliberately absent from page
 * payloads.
 */

const toSocials = (socials: ISettings['socials']): Socials => ({
  instagram: socials.instagram ?? null,
  facebook: socials.facebook ?? null,
  x: socials.x ?? null,
  linkedin: socials.linkedin ?? null,
  youtube: socials.youtube ?? null,
});

const toSettings = (settings: ISettings): SiteSettings => ({
  firmName: settings.firmName,
  legalDescriptor: settings.legalDescriptor,
  tagline: settings.tagline,
  foundedYear: settings.foundedYear,
  phone: settings.phone ?? null,
  email: settings.email ?? null,
  socials: toSocials(settings.socials),
  copyright: settings.copyright,
});

const toLinks = (links: readonly ILink[] | undefined): Link[] =>
  (links ?? []).map((link) => ({ label: link.label, href: link.href, kind: link.kind }));

/** A dropdown's items (ADR-050): the About anchors from settings, or the public categories. */
function dropdownFor(entry: NavEntry, settings: ISettings): Link[] {
  if (entry.dropdown === 'aboutAnchors') return toLinks(settings.aboutAnchors);

  if (entry.dropdown === 'insightCategories') {
    return PUBLIC_INSIGHT_CATEGORIES.map((category) => ({
      label: INSIGHT_CATEGORIES.labels[category],
      href: `/insights?category=${category}`,
      kind: 'internal' as const,
    }));
  }

  return [];
}

function toNav(settings: ISettings): NavItem[] {
  return NAV_ENTRIES.map((entry) => ({
    label: entry.label,
    href: entry.href,
    kind: entry.kind,
    children: dropdownFor(entry, settings),
  }));
}

function toFooter(sources: ISiteSources): SiteFooter {
  const { settings, practiceAreas, offices } = sources;

  return {
    tagline: settings.tagline,
    links: toLinks(settings.footerLinks),
    // Only the areas the firm flagged for the footer: all nine in v2.
    practiceAreas: practiceAreas.filter((area) => area.showInFooter).map(practiceAreaRef),
    offices: offices.map((office) => toFooterOffice(office, settings)),
    legalLinks: toLinks(settings.legalLinks),
    // Copy only: there is no subscribe endpoint (DESIGN_UPDATE_V2 §14).
    newsletter: {
      title: settings.newsletter.title,
      note: settings.newsletter.note,
      enabled: settings.newsletter.enabled,
    },
    socials: toSocials(settings.socials),
    copyright: settings.copyright,
  };
}

function toFaqSection(settings: ISettings, faqs: ISiteFaq[]): SiteFaqSection {
  return {
    eyebrow: settings.faqSection.eyebrow ?? null,
    title: settings.faqSection.title,
    items: faqs.map(toFaq),
    stillHaveQuestions: {
      title: settings.stillHaveQuestions.title,
      text: settings.stillHaveQuestions.text,
      actions: settings.stillHaveQuestions.actions.map((action) => ({
        label: action.label,
        href: action.href,
        kind: action.kind,
      })),
    },
  };
}

export function toSite(sources: ISiteSources): Site {
  const { settings, faqs } = sources;

  return {
    settings: toSettings(settings),
    nav: toNav(settings),
    footer: toFooter(sources),
    faqSection: toFaqSection(settings, faqs),
    contactCallout: {
      title: settings.contactCallout.title,
      text: settings.contactCallout.text,
      primaryCta: settings.contactCallout.primaryCta ?? null,
      secondaryCta: settings.contactCallout.secondaryCta ?? null,
    },
  };
}
