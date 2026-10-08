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

/** The first and last words of `name` both appear in `other`. */
function namedIn(name: string, other: string): boolean {
  const mine = words(name.replace(HONORIFIC, ''));
  const theirs = words(other);
  const first = mine[0];
  const last = mine.at(-1);
  // A clipped surname is still theirs: "Olayink" is "Olayinka".
  const has = (word: string): boolean =>
    theirs.some(
      (t) =>
        t === word ||
        (Math.min(t.length, word.length) >= 6 && (t.startsWith(word) || word.startsWith(t)))
    );
  return first !== undefined && last !== undefined && has(first) && has(last);
}

/**
 * Same person, whichever of the two carries a middle name: "Hilda Omono
 * Okoduwa" is "Hilda Okoduwa", and the other way round.
 */
export const sameWriter = (name: string, other: string): boolean =>
  namedIn(name, other) || namedIn(other, name);

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

/** "Peter Olalere, MCIArb" → "Peter Olalere"; capitals fixed as for a byline. */
const profileName = (profile: ExportProfile): string => {
  const bare = profile.name.split(',')[0] ?? profile.name;
  return cleanName(bare) ?? bare.trim();
};

/**
 * A run of names that is two writers' names side by side, one per photo:
 * "Sunday Omoniyi Patricia Magaji" under two photos.
 */
function nameLine(text: string, photos = 1): string[] {
  const parts = text.split(/\s+/).filter(Boolean);
  // A title, "Double Allocation Of Land", not a name.
  if (parts.some((part) => /^(?:of|the|and|in|on|for|to|a|an|with|at|from|is|are|by)$/i.test(part)))
    return [];
  if (photos > 1 && parts.length === photos * 2) {
    const pairs = Array.from({ length: photos }, (_, index) =>
      cleanName(parts.slice(index * 2, index * 2 + 2).join(' '))
    );
    if (pairs.every((name) => name !== null)) return pairs;
  }
  const single = cleanName(text);
  return single === null ? [] : [single];
}

/**
 * Writers shown as a photo with a caption and no "By": the caption is their
 * name (ADR-064). With no caption at all, a photo whose file is named after
 * someone in the export is theirs, "Abiodun-Ogunnubi340.jpg".
 */
function photoCaptionNames(
  head: string,
  photos: readonly { words: string }[],
  profiles: readonly ExportProfile[]
): string[] {
  if (photos.length === 0) return [];

  const caption = head
    .replace(/<img\b[^>]*>/gi, '\n')
    .split(/<\/?(?:p|div|strong|b|br|h[1-6]|span|a|em|u)\b[^>]*>|\n/i)
    .map((segment) => blockText(segment))
    .find((segment) => !NOTHING_LEFT.test(segment));
  // A caption counts only when a photo is named after the person in it
  // ("Hilda-223x300.jpg" under "Hilda Omono Okoduwa"), so a heading such as
  // "Intellectual Property" under a banner is never taken for a writer.
  const named = caption === undefined ? [] : nameLine(caption, photos.length);
  const pictured = (name: string): boolean =>
    photos.some((photo) => {
      const tokens = new Set(words(photo.words));
      return words(name).some((word) => word.length > 2 && tokens.has(word));
    });
  if (named.length > 0 && named.every(pictured)) return named;

  return photos.flatMap((photo) => {
    const profile = profiles.find((p) => namedIn(profileName(p), photo.words));
    return profile === undefined ? [] : [profileName(profile)];
  });
}

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

  const found =
    /(?:^|>|\s)By\s*:?\s*([\s\S]{2,300}?)(?:<\/(?:p|h[1-6]|div|li)>|<br\s*\/?>|<img\b|\r?\n)/i.exec(
      head
    );
  // Only a byline near the top counts, not "extended by Mr. Kashif Inuwa" in
  // the opening sentence (as `leadingByline`).
  const byline =
    found !== null && blockText(head.slice(0, found.index)).length <= 200 ? found : null;
  const names = byline
    ? blockText(byline[1] ?? '')
        .split(/\s+(?:and|&)\s+|\s*[,;|]\s*/)
        .map((part) => cleanName(part))
        .filter((name): name is string => name !== null)
    : slugs.length > 0
      ? slugs.flatMap((slug) => {
          const profile = profiles.find((p) => p.slug === slug);
          if (profile === undefined) return [];
          return [profileName(profile)];
        })
      : photoCaptionNames(head, photos, profiles);

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
  // "2nd May 2024 By Christian Oyewale": a date line run into the byline.
  const undated = text.replace(/^\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+,?\s+\d{4}\s+/, '');
  const match = /^by\s*:?\s*(.+)$/i.exec(undated);
  if (!match || text.length > 160) return false;
  const writers = match[1] ?? '';
  const first = writers.split(/\s+(?:and|&)\s+|\s*[,;|(]\s*/)[0] ?? '';
  // "By Capital Market and Corporate Finance Department": the "and" is in the name.
  return cleanName(first) !== null || /\b(?:department|unit|team|group|desk)\b/i.test(writers);
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
 * sits at the top of an article that has a byline, or is captioned with a
 * name alone ("Hilda Omono Okoduwa"), in its block or the next. Otherwise an
 * image at the top is content, like a group photo of new associates, and
 * stays. `leadingPhotoIsAuthor` says an uncaptioned first picture is the
 * writer's, when the caller knows it from the photo's file name.
 */
export function stripLeadingByline(
  html: string,
  options: {
    readonly leadingPhotoIsAuthor?: boolean;
    /** The article's writers: a leading line that is only one of their names goes. */
    readonly writerNames?: readonly string[];
  } = {}
): string {
  const isWriterLine = (text: string): boolean => {
    const names = nameLine(text);
    return (
      names.length > 0 &&
      names.every((name) => (options.writerNames ?? []).some((writer) => sameWriter(name, writer)))
    );
  };
  const blocks: { whole: string; inner: string; hasImage: boolean; text: string }[] = [];
  let rest = html;
  while (blocks.length < 3) {
    const match = LEADING_BLOCK.exec(rest);
    if (!match) break;
    const inner = match[2] ?? '';
    const withoutImages = inner.replace(IMAGE_LINK, '');
    blocks.push({
      whole: match[0],
      inner,
      hasImage: withoutImages !== inner,
      text: blockText(withoutImages),
    });
    rest = rest.slice(match[0].length);
  }

  // A photo captioned with a name alone, in the same block or the next.
  const dropped = new Set<number>();
  blocks.forEach((block, index) => {
    if (!block.hasImage) return;
    const photos = (block.inner.match(IMAGE_LINK) ?? []).length;
    if (nameLine(block.text, photos).length > 0) {
      dropped.add(index);
      return;
    }
    if (!NOTHING_LEFT.test(block.text)) return;
    const next = blocks[index + 1];
    if (next !== undefined && !next.hasImage && nameLine(next.text).length > 0) {
      dropped.add(index).add(index + 1);
    } else if (index === 0 && options.leadingPhotoIsAuthor === true) {
      dropped.add(index);
    }
  });

  const hasByline = dropped.size > 0 || blocks.some(({ text }) => isBylineText(text));
  const withoutPhotos = (inner: string): string => {
    const once = inner
      .replace(BANNER_LINK, '')
      .replace(/<a\b[^>]*href="[^"]*\/people\/[^"]*"[^>]*>\s*View image\s*<\/a>/gi, '');
    return hasByline ? once.replace(IMAGE_LINK, '') : once;
  };

  let kept = '';
  for (const [index, { whole, inner }] of blocks.entries()) {
    if (dropped.has(index)) continue;
    let remaining = withoutPhotos(inner);

    // "By Dr. John Onyido<br /><strong>TITLE</strong>": the byline and the
    // title share a paragraph, so only the line before the break goes.
    const lineBreak = /<br\s*\/?>/i.exec(remaining);
    if (lineBreak !== null && isBylineText(blockText(remaining.slice(0, lineBreak.index)))) {
      remaining = remaining.slice(lineBreak.index + lineBreak[0].length);
    }

    const onlyPhotos = NOTHING_LEFT.test(blockText(remaining.replace(PROFILE_LINK, '')));
    const text = blockText(remaining);
    if (onlyPhotos || isBylineText(text) || isWriterLine(text)) continue;

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
