/**
 * Cleaning WordPress / page-builder HTML into what the backend stores.
 *
 * Two phases, because media uploads sit in between:
 *
 * 1. `prepareHtml` turns WordPress markup into plain HTML: shortcodes, layout
 *    wrappers, paragraphs from bare line breaks, and every `<img>` into a link
 *    (the backend stores no inline images — agreed with TLS). Its output is
 *    where the referenced upload paths are read from, after `srcset` and its
 *    resized copies have gone.
 * 2. `finishHtml` swaps old upload URLs for the new media URLs, then runs the
 *    backend's own sanitiser, so the dry run sees exactly what the API stores.
 *
 * All pure: the I/O lives in media.ts.
 */
import { sanitizeRichText } from '../../src/helpers/sanitize.helper.js';
import { DROPPED_SHORTCODES, LAYOUT_SHORTCODES } from './maps.js';
import { decode, plainText } from './text.js';

export interface PreparedHtml {
  readonly html: string;
  /** Images turned into links. */
  readonly inlineImages: number;
  /** Shortcodes removed with their content, such as galleries. */
  readonly droppedShortcodes: readonly string[];
  /** `[video]` and `[embed]` turned into links. */
  readonly embeds: number;
}

/** A link to the old site's uploads folder: absolute, protocol-relative or root-relative. */
const UPLOAD_URL =
  /(?:(?:https?:)?\/\/(?:www\.)?spaajibade\.com|(?<![\w.:/-]))\/wp-content\/uploads\/([^"'\s<>?#)]+)(?:\?[^"'\s<>#)]*)?/gi;

const BLOCK_START =
  /^<\/?(?:p|ul|ol|li|h[1-6]|table|thead|tbody|tfoot|tr|td|th|blockquote|pre|figure|figcaption|hr|dl|dd|dt)\b/i;

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const attr = (attrs: string, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(
    attrs
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};

const link = (href: string, text: string): string =>
  `<a href="${escapeAttr(href)}">${escapeText(text)}</a>`;

/**
 * WordPress's `wpautop`, simplified: text separated by a blank line is a
 * paragraph, and a single line break inside one is a `<br />`. Chunks that
 * already start with a block tag are left alone, so HTML that has its own
 * paragraphs passes through.
 */
export function autop(html: string): string {
  return html
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '')
    .map((chunk) =>
      BLOCK_START.test(chunk) ? chunk : `<p>${chunk.replace(/\n/g, '<br />\n')}</p>`
    )
    .join('\n');
}

export function prepareHtml(raw: string | null | undefined): PreparedHtml {
  let html = (raw ?? '').replace(/\r\n?/g, '\n');
  const droppedShortcodes: string[] = [];
  let embeds = 0;
  let inlineImages = 0;

  // Shortcodes. [caption] keeps its image and caption text.
  html = html.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g, '$1');
  html = html.replace(LAYOUT_SHORTCODES, '');
  html = html.replace(DROPPED_SHORTCODES, (_match, name: string) => {
    droppedShortcodes.push(name);
    return '';
  });
  html = html.replace(/\[embed[^\]]*\]([\s\S]*?)\[\/embed\]/g, (_match, url: string) => {
    embeds += 1;
    return `\n\n${link(url.trim(), url.trim())}\n\n`;
  });
  html = html.replace(/\[video([^\]]*)\](?:[\s\S]*?\[\/video\])?/g, (_match, attrs: string) => {
    const src = attr(attrs, 'mp4') ?? attr(attrs, 'src') ?? attr(attrs, 'webm');
    if (src === undefined) return '';
    embeds += 1;
    return `\n\n${link(src, 'Watch the video')}\n\n`;
  });

  // Page-builder wrappers carry layout, not meaning; their text becomes paragraphs.
  html = html.replace(/<\/?(?:div|section|article|header|footer)\b[^>]*>/gi, '\n\n');
  // The page title is the only h1; h5 and h6 are not in the allow-list.
  html = html.replace(/<(\/?)h1\b/gi, '<$1h2').replace(/<(\/?)h[56]\b/gi, '<$1h4');

  html = autop(html);

  // An image wrapped in a link to its full-size file becomes that one link.
  html = html.replace(
    /<a\b([^>]*)>\s*<img\b([^>]*)>\s*<\/a>/gi,
    (_match, aAttrs: string, imgAttrs: string) => {
      const href = attr(aAttrs, 'href') ?? attr(imgAttrs, 'src');
      if (href === undefined) return '';
      inlineImages += 1;
      return link(href, decode(attr(imgAttrs, 'alt')) || 'View image');
    }
  );
  html = html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const src = attr(attrs, 'src');
    if (src === undefined || src.startsWith('data:')) return '';
    inlineImages += 1;
    return link(src, decode(attr(attrs, 'alt')) || 'View image');
  });

  return { html, inlineImages, droppedShortcodes, embeds };
}

/** Normalise an upload path: URL-decoded, no leading slash. */
const uploadPath = (captured: string): string => {
  let path = captured;
  try {
    path = decodeURI(captured);
  } catch {
    // A stray % in a file name: keep it as written.
  }
  return path.replace(/^\/+/, '');
};

/** Every old-site upload this HTML links to, as paths inside the uploads folder. */
export const findUploadPaths = (html: string): string[] => [
  ...new Set([...html.matchAll(UPLOAD_URL)].map((match) => uploadPath(match[1] ?? ''))),
];

/**
 * Replace each old upload URL with its new media URL, sanitise, and tidy.
 * A path with no new URL keeps its old link; the caller reports it as missing.
 */
export function finishHtml(
  html: string,
  urlFor: (path: string) => string | undefined
): string | null {
  const rewritten = html.replace(UPLOAD_URL, (whole, captured: string) => {
    return urlFor(uploadPath(captured)) ?? whole;
  });

  const clean = sanitizeRichText(rewritten)
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/g, '')
    .replace(/(?:&nbsp;\s*){2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return plainText(clean) === '' ? null : clean;
}

/**
 * True when the article is essentially a wrapper for one PDF: it links one
 * firm-hosted PDF and has little text of its own. Its "Read Article" link
 * should open that PDF (agreed with TLS).
 */
export function isPdfWrapper(html: string, firmPdfPaths: readonly string[]): boolean {
  if (firmPdfPaths.length !== 1) return false;
  const ownText = plainText(html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' '));
  return ownText.length < 600;
}
