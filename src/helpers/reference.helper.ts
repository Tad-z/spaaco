import { randomInt } from 'node:crypto';

/**
 * The reference a submitter is given, and the only thing a form returns.
 *
 * `I` and `O` are absent from the alphabet, because a reference gets read out
 * over the phone and typed back in, where they are indistinguishable from 1
 * and 0. Six characters over 34 symbols is about 1.5 billion combinations,
 * which is ample for a firm's enquiry volume and short enough to dictate.
 *
 * Generated with `randomInt`, not `Math.random`: a guessable reference would
 * let somebody enumerate submissions if one is ever used as a lookup key.
 */
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 6;

export type ReferencePrefix = 'ENQ' | 'MSG' | 'APP';

export function generateReference(prefix: ReferencePrefix): string {
  const suffix = Array.from({ length: LENGTH }, () =>
    ALPHABET.charAt(randomInt(ALPHABET.length))
  ).join('');

  return `${prefix}-${suffix}`;
}
