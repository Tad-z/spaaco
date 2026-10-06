/**
 * Who wrote an article (ADR-060).
 *
 * WordPress's `author` was the admin account that posted the article, not the
 * lawyer who wrote it. The writer is in the article itself:
 *
 * 1. a byline at the top, "By David Essien", usually linking to the writer's
 *    old profile page (`/people/<slug>/`), which is the surest sign of all;
 * 2. on older posts, a closing "Download PDF: <title> - <name>" line;
 * 3. on older posts, the end of the slug, "…-frederick-adefarati".
 *
 * A writer who is on the site is credited to their profile; anyone else
 * (former staff, guests) is credited by name. All pure.
 */
import { PEOPLE_SLUG_MAP } from './maps.js';
import { decode, fixShouting } from './text.js';

export interface KnownPerson {
  readonly id: string;
  readonly slug: string;
  readonly firstName: string;
  readonly lastName: string;
}

export type Credit =
  | { readonly kind: 'person'; readonly id: string; readonly name: string }
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'firm' };

const HONORIFIC = /^(?:dr|mr|mrs|ms|miss|prof|chief|barr|engr)\.?\s+/i;

/** Words that mean the "name" is really a heading, a unit or a public figure. */
const NOT_A_NAME =
  /\b(?:the|department|unit|team|market|markets|capital|nigeria|nigerian|law|firm|practice|group|desk|partners|associates|editor|review|update|president|governor|minister|honourable|justice|senator)\b/i;

/** Where a name ends when a byline runs straight into the title. */
const NAME_STOP = /^(?:[A-Z]{3,}[A-Z:,.]*|Is|Are|From|The|A|An|Of|In|On|For|To|With|At)$/;

const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1);

const blockText = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const fullName = (person: KnownPerson): string => `${person.firstName} ${person.lastName}`;

/**
 * A plausible person's name, tidied: no honorific, no trailing punctuation,
 * capitals fixed, two to four words. Null when it is not one.
 */
export function cleanName(raw: string): string | null {
  const name = fixShouting(
    decode(raw)
      .replace(HONORIFIC, '')
      .replace(/[\s,;:.]+$/, '')
      .trim()
  );
  const parts = name.split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 4 || name.length > 60) return null;
  if (NOT_A_NAME.test(name)) return null;
  if (!parts.every((part) => /^[A-Z][A-Za-z’'.-]*$/.test(part))) return null;
  return parts.join(' ');
}

/** The first writer in a byline's text: "David Essien and Emmanuel Bassey" → "David Essien". */
function firstWriter(text: string): string | null {
  const whole = text.split(/\s+(?:and|&)\s+|\s*[,;|]\s*/)[0] ?? '';
  // Up to the first word that starts the title rather than continues the name.
  const tokens = whole.split(' ').filter(Boolean);
  const stop = tokens.findIndex((token, index) => index >= 2 && NAME_STOP.test(token));
  const first = stop < 0 ? tokens : tokens.slice(0, stop);
  return cleanName(first.join(' ')) ?? cleanName(first.slice(0, 2).join(' '));
}

/** The byline at the top: "By …" up to the end of its paragraph, heading or line. */
export function leadingByline(html: string | null | undefined): string | null {
  const head = (html ?? '').slice(0, 6000);
  const match =
    /(?:^|>|\s)By\s*:?\s*([\s\S]{2,300}?)(?:<\/(?:p|h[1-6]|div|li)>|<br\s*\/?>|<img\b|\r?\n)/i.exec(
      head
    );
  if (!match) return null;
  // Only a byline near the top counts, not "by" in the opening sentence.
  if (blockText(head.slice(0, match.index)).length > 200) return null;
  return firstWriter(blockText(match[1] ?? ''));
}

/** The closing "Download PDF: <title> - <name>" line of older posts. */
export function pdfLineWriter(html: string | null | undefined): string | null {
  const tail = blockText((html ?? '').slice(-3000));
  const match = /Download PDF:.*\s[-–]\s+([^-–]{3,80}?)\s*$/.exec(tail);
  return match ? firstWriter(match[1] ?? '') : null;
}

const named = (candidate: readonly string[], person: KnownPerson): boolean => {
  const first = words(person.firstName)[0];
  const last = words(person.lastName).at(-1);
  return (
    first !== undefined &&
    last !== undefined &&
    candidate.includes(first) &&
    candidate.includes(last)
  );
};

/**
 * Who to credit. A link to the writer's old profile, or a name that matches
 * someone on the site, credits their profile; a name that matches no one is a
 * named writer; nothing at all is the firm. The slug suffix is only trusted
 * for people on the site, since anything else in a slug could be the title.
 */
export function creditFor(
  html: string | null | undefined,
  wordpressSlug: string,
  people: readonly KnownPerson[]
): Credit {
  const linked = /spaajibade\.com\/people\/([a-z0-9-]+)/i.exec((html ?? '').slice(0, 3000))?.[1];
  if (linked !== undefined) {
    const slug = PEOPLE_SLUG_MAP[linked] ?? linked;
    const person = people.find((p) => p.slug === slug);
    if (person !== undefined) return { kind: 'person', id: person.id, name: fullName(person) };
  }

  const name = leadingByline(html) ?? pdfLineWriter(html);
  if (name !== null) {
    const person = people.find((p) => named(words(name), p));
    return person === undefined
      ? { kind: 'named', name }
      : { kind: 'person', id: person.id, name: fullName(person) };
  }

  const bySlug = people.find((p) => {
    const first = words(p.firstName)[0];
    const last = words(p.lastName).at(-1);
    return (
      first !== undefined &&
      last !== undefined &&
      new RegExp(`-${first}(?:-[a-z]+)?-${last}$`).test(wordpressSlug)
    );
  });
  return bySlug === undefined
    ? { kind: 'firm' }
    : { kind: 'person', id: bySlug.id, name: fullName(bySlug) };
}
