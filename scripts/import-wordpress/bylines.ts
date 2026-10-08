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
  /** False for a draft profile, which the public site does not show. */
  readonly published?: boolean;
}

export type Credit =
  | { readonly kind: 'person'; readonly id: string; readonly name: string }
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'firm' };

const HONORIFIC = /^(?:dr|mr|mrs|ms|miss|prof|chief|barr|engr)\.?\s+/i;

/** Words that mean the "name" is really a heading, a unit or a public figure. */
const NOT_A_NAME =
  /\b(?:the|department|unit|team|market|markets|capital|nigeria|nigerian|law|firm|practice|group|desk|partners|associates|editor|review|update|president|governor|minister|honourable|justice|senator|state)\b/i;

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

/** Same person: the first and last words of `name` both appear in `other`. */
export function sameWriter(name: string, other: string): boolean {
  const mine = words(name.replace(HONORIFIC, ''));
  const theirs = new Set(words(other));
  const first = mine[0];
  const last = mine.at(-1);
  return first !== undefined && last !== undefined && theirs.has(first) && theirs.has(last);
}

/** A writer named in an article's byline, with the photo shown beside them there. */
export interface BylineWriter {
  readonly name: string;
  /** Their old profile slug, when the byline linked to it. */
  readonly slug?: string;
  /** The photo's path inside the old uploads folder. */
  readonly photo?: string;
}

/** A former profile in the export: its slug, name and photo. */
export interface ExportProfile {
  readonly slug: string;
  readonly name: string;
  readonly photo: string | null;
}

/**
 * Where the byline sits: the start of the post, up to the title or the first
 * list or heading, whichever comes first.
 */
const bylineHead = (html: string): string => {
  const head = html.slice(0, 2500);
  const end = head.search(/<p[^>]*text-align:\s*center|<ol\b|<ul\b|<h[1-6]\b/i);
  return end < 0 ? head : head.slice(0, end);
};

const UPLOAD_PATH = /\/wp-content\/uploads\/([^"'\s<>?#]+)/i;

/** The words of a photo's file name and alt text, to tell whose face it is. */
const photoWords = (src: string, alt: string): string =>
  `${decodeURIComponent(src.split('/').pop() ?? '').replace(/[-_.]+/g, ' ')} ${alt}`;

/**
 * Everyone named at the top of an article, in byline order, each with the
 * photo beside them there (ADR-064). The names come from the "By …" line;
 * a byline that is only a row of linked photos gives its people's names from
 * their old profiles. A photo is matched to a writer by its file name or alt
 * text, or by position when the byline has one photo per writer.
 */
export function bylineWriters(
  html: string | null | undefined,
  profiles: readonly ExportProfile[]
): BylineWriter[] {
  const head = bylineHead(html ?? '');

  const photos = [...head.matchAll(/<img\b([^>]*)>/gi)].flatMap((match) => {
    const attrs = match[1] ?? '';
    const src = /\bsrc="([^"]+)"/i.exec(attrs)?.[1] ?? '';
    const path = UPLOAD_PATH.exec(src)?.[1];
    if (path === undefined) return [];
    const alt = decode(/\balt="([^"]*)"/i.exec(attrs)?.[1] ?? '');
    return [{ path: decodeURI(path), words: photoWords(src, alt) }];
  });
  const slugs = [
    ...new Set(
      [...head.matchAll(/spaajibade\.com\/people\/([a-z0-9-]+)/gi)].map((m) => m[1] ?? '')
    ),
  ];

  const byline =
    /(?:^|>|\s)By\s*:?\s*([\s\S]{2,300}?)(?:<\/(?:p|h[1-6]|div|li)>|<br\s*\/?>|<img\b|\r?\n)/i.exec(
      head
    );
  const names = byline
    ? blockText(byline[1] ?? '')
        .split(/\s+(?:and|&)\s+|\s*[,;|]\s*/)
        .map((part) => cleanName(part))
        .filter((name): name is string => name !== null)
    : slugs.flatMap((slug) => {
        const profile = profiles.find((p) => p.slug === slug);
        if (profile === undefined) return [];
        // "Peter Olalere, MCIArb" → "Peter Olalere"; capitals fixed as for a byline.
        const bare = profile.name.split(',')[0] ?? profile.name;
        return [cleanName(bare) ?? bare.trim()];
      });

  const unclaimed = [...photos];
  const writers = names.map((name) => {
    const slug = slugs.find((s) => sameWriter(name, s.replace(/-/g, ' ')));
    const index = unclaimed.findIndex((photo) => {
      const tokens = new Set(words(photo.words));
      return words(name).some((word) => word.length > 2 && tokens.has(word));
    });
    const photo = index < 0 ? undefined : unclaimed.splice(index, 1)[0]?.path;
    return {
      name,
      ...(slug === undefined ? {} : { slug }),
      ...(photo === undefined ? {} : { photo }),
    };
  });

  // One photo per writer and none matched by name: they are in byline order.
  if (photos.length === names.length && writers.every((writer) => writer.photo === undefined)) {
    return writers.map((writer, index) => ({ ...writer, photo: photos[index]?.path }));
  }
  return writers;
}

/** A former profile's photo, for a writer who is not on the new site. */
export const profilePhoto = (
  writer: Pick<BylineWriter, 'name' | 'slug'>,
  profiles: readonly ExportProfile[]
): string | null =>
  profiles.find(
    (profile) =>
      profile.photo !== null &&
      ((writer.slug !== undefined && profile.slug === writer.slug) ||
        sameWriter(writer.name, profile.name))
  )?.photo ?? null;

/** A link an image became: an image file, or "View image". */
const IMAGE_LINK =
  /<a\b[^>]*href="[^"]*(?:\.(?:png|jpe?g|gif|webp)|\/image\/upload\/[^"]*)"[^>]*>[\s\S]*?<\/a>|<a\b[^>]*>\s*View image\s*<\/a>/gi;
/** An old article header banner, such as `Article-header-SPA.png`. */
const BANNER_LINK =
  /<a\b[^>]*href="[^"]*header[^"/]*\.(?:png|jpe?g|gif|webp)"[^>]*>[\s\S]*?<\/a>/gi;
/** A link to an old attorney profile, which in a byline is a face or a name. */
const PROFILE_LINK = /<a\b[^>]*href="[^"]*\/people\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
const LEADING_BLOCK = /^\s*<(p|h[1-6]|ol|ul)\b[^>]*>([\s\S]*?)<\/\1>\s*/i;
/** What is left of a block once its photos are gone: no letter or digit, only separators. */
const NOTHING_LEFT = /^[^\p{L}\p{N}]*$/u;

const isBylineText = (text: string): boolean => {
  const match = /^by\s*:?\s*(.+)$/i.exec(text);
  if (!match || text.length > 160) return false;
  const first = (match[1] ?? '').split(/\s+(?:and|&)\s+|\s*[,;|(]\s*/)[0] ?? '';
  return cleanName(first) !== null || /\b(?:department|unit|team|group|desk)\b/i.test(first);
};

/**
 * Take the old site's byline off the top of an article (ADR-064): the "By …"
 * line, the writers' photos (which the import turned into "View image"
 * links), and old header banners. The page shows the author block instead.
 *
 * Only the first three blocks are looked at, since a byline can follow a date
 * line or the title, and "by" deeper in the text is ordinary prose. A block
 * that is only author photos, or only a short "By <name>" line, goes; any
 * other block stays, without them.
 *
 * A picture is taken as an author's only when it links to their old profile,
 * or sits at the top of an article that has a byline. Otherwise an image at
 * the top is content, like a group photo of new associates, and stays.
 */
export function stripLeadingByline(html: string): string {
  const blocks: { whole: string; inner: string }[] = [];
  let rest = html;
  while (blocks.length < 3) {
    const match = LEADING_BLOCK.exec(rest);
    if (!match) break;
    blocks.push({ whole: match[0], inner: match[2] ?? '' });
    rest = rest.slice(match[0].length);
  }

  const hasByline = blocks.some(({ inner }) =>
    isBylineText(blockText(inner.replace(IMAGE_LINK, '')))
  );
  const withoutPhotos = (inner: string): string => {
    const once = inner
      .replace(BANNER_LINK, '')
      .replace(/<a\b[^>]*href="[^"]*\/people\/[^"]*"[^>]*>\s*View image\s*<\/a>/gi, '');
    return hasByline ? once.replace(IMAGE_LINK, '') : once;
  };

  let kept = '';
  for (const { whole, inner } of blocks) {
    const remaining = withoutPhotos(inner);
    const onlyPhotos = NOTHING_LEFT.test(blockText(remaining.replace(PROFILE_LINK, '')));
    if (onlyPhotos || isBylineText(blockText(remaining))) continue;

    kept +=
      remaining === inner
        ? whole
        : // A banner in front of "Introduction": the text stays, the space goes.
          whole.replace(
            inner,
            remaining.replace(/^((?:\s*<(?:strong|b|em|u|li)\b[^>]*>)*)\s*/i, '$1')
          );
  }

  return (kept + rest).trim();
}
