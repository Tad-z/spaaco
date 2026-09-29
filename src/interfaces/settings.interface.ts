import type { ILink } from './common.interface.js';

/** Social profiles. Null until the firm supplies each URL. */
export interface ISocials {
  instagram?: string | null;
  facebook?: string | null;
  x?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
}

/** The card beside the FAQ accordion, with its three contact actions. */
export interface IStillHaveQuestions {
  title: string;
  text: string;
  actions: ILink[];
}

/** The footer newsletter block's copy. No subscribe endpoint exists (DESIGN_UPDATE_V2 §14). */
export interface INewsletter {
  title: string;
  note: string;
  enabled: boolean;
}

export interface IContactCallout {
  title: string;
  text: string;
  primaryCta?: ILink | null;
  secondaryCta?: ILink | null;
}

/**
 * Site-wide settings. Exactly one document, `key: 'site'`.
 *
 * Carries `revision` for optimistic locking, like pages: two editors saving the
 * footer at once must not silently overwrite each other (ADR-015).
 */
export interface ISettings {
  key: 'site';
  firmName: string;
  legalDescriptor: string;
  tagline: string;
  foundedYear: number;
  phone?: string | null;
  email?: string | null;
  socials: ISocials;
  copyright: string;
  faqSection: { eyebrow?: string | null; title: string };
  stillHaveQuestions: IStillHaveQuestions;
  contactCallout: IContactCallout;
  /** The About Us nav dropdown: anchors into the About page (ADR-050). */
  aboutAnchors: ILink[];
  /** The footer's Quick Links column. */
  footerLinks: ILink[];
  legalLinks: ILink[];
  newsletter: INewsletter;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
