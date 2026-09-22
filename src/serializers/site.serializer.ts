import type {
  NavItem,
  Site,
  SiteFaqSection,
  SiteFooter,
  SiteSettings,
  Socials,
} from '../types/api.js';
import type { ISettings } from '../interfaces/settings.interface.js';
import type { ISiteFaq, ISitePracticeArea, ISiteSources } from '../interfaces/site.interface.js';
import { NAV_ENTRIES } from '../constants/navigation.js';
import { toFaq } from './faq.serializer.js';
import { toRef as practiceAreaRef } from './practice-area.serializer.js';
import { toRef as officeRef } from './office.serializer.js';

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

function toNav(practiceAreas: ISitePracticeArea[]): NavItem[] {
  return NAV_ENTRIES.map((entry) => ({
    label: entry.label,
    href: entry.href,
    kind: entry.kind,
    children:
      entry.practiceAreaDropdown === true
        ? practiceAreas.map((area) => ({
            label: area.title,
            href: `/practice-areas/${area.slug}`,
            kind: 'internal' as const,
          }))
        : [],
  }));
}

function toFooter(sources: ISiteSources): SiteFooter {
  const { settings, practiceAreas, offices } = sources;

  return {
    tagline: settings.tagline,
    links: NAV_ENTRIES.map((entry) => ({
      label: entry.label,
      href: entry.href,
      kind: entry.kind,
    })),
    // Only the areas the firm flagged for the footer, which is a shorter list
    // than the nav dropdown by design.
    practiceAreas: practiceAreas.filter((area) => area.showInFooter).map(practiceAreaRef),
    offices: offices.map(officeRef),
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
  const { settings, practiceAreas, faqs } = sources;

  return {
    settings: toSettings(settings),
    nav: toNav(practiceAreas),
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
