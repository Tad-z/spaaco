import sanitizeHtml from 'sanitize-html';

/**
 * Rich-text sanitisation, applied on write.
 *
 * Editors paste from Word and from the web, so the input is untrusted even
 * though the author is authenticated: a pasted `<script>` or an `onclick`
 * attribute would otherwise be stored and served to every visitor. Sanitising
 * on write rather than on read means it happens once, and a stored value is
 * always safe to render.
 *
 * The allow-list is what a legal article needs: headings, lists, emphasis,
 * block quotes, links and simple tables. Notably absent are `img` (images are
 * media records attached by id, not inline HTML), `style` and `script`.
 */

const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'sup',
  'sub',
] as const;

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // No javascript: or data: URLs, which are the usual way an anchor becomes
  // an execution vector.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Anything outside the allow-list loses its tag but keeps its text, so an
  // editor pasting a styled document does not silently lose their words.
  disallowedTagsMode: 'discard',
  transformTags: {
    // A link that opens a new tab without noopener hands the opener to the
    // destination page.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
    }),
  },
};

/** Sanitise a rich-text field. */
export const sanitizeRichText = (html: string): string => sanitizeHtml(html, SANITIZE_OPTIONS);

/** Strip every tag, for fields that are plain text but may be pasted from HTML. */
export const stripTags = (value: string): string =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
