/**
 * Plain-text helpers for WordPress values: entity decoding, whitespace, casing
 * and length limits. Pure, so the transforms built on them are unit-testable.
 */
import { decodeHTML } from 'entities';
import { stripTags } from '../../src/helpers/sanitize.helper.js';

/** Decode HTML entities (`&amp;`, `&#8217;`, `&nbsp;`) and collapse whitespace. */
export const decode = (value: string | null | undefined): string =>
  decodeHTML(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The visible text of an HTML fragment, decoded and on one line. */
export const plainText = (html: string | null | undefined): string =>
  decode(stripTags((html ?? '').replace(/<\/(p|li|h[1-6]|div|tr)>|<br\s*\/?>/gi, ' ')));

/**
 * Cut at a word boundary, ending with an ellipsis, so a limit never leaves
 * half a word. Text already within the limit is returned untouched.
 */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;

  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? room.slice(0, lastSpace) : room;

  return `${cut.replace(/[\s,;:.–-]+$/, '')}…`;
}

const capitalise = (word: string): string =>
  word
    .toLowerCase()
    .replace(
      /(^|[-'’])(\p{L})/gu,
      (_match, sep: string, letter: string) => sep + letter.toUpperCase()
    );

/**
 * Some names were typed in capitals ("IDORENYIN EKPENYONG"). Title-case those,
 * and leave mixed-case names alone: "McDonald" or "dE" are deliberate.
 */
export const fixShouting = (name: string): string =>
  /\p{Lu}/u.test(name) && name === name.toUpperCase()
    ? name.split(' ').map(capitalise).join(' ')
    : name;

/**
 * A WordPress local time ("2023-05-12 09:00:00", Africa/Lagos, which has no
 * daylight saving) as ISO 8601 with its offset.
 */
export function lagosToIso(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Not a WordPress date: "${value}"`);

  return `${match[1] ?? ''}T${match[2] ?? ''}+01:00`;
}
