import { randomInt } from 'node:crypto';
import type { REFERENCE_PREFIXES } from '../config/constants.js';

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

/** Derived from the constant, so the two cannot disagree. */
export type ReferencePrefix = (typeof REFERENCE_PREFIXES)[keyof typeof REFERENCE_PREFIXES];

export function generateReference(prefix: ReferencePrefix): string {
  const suffix = Array.from({ length: LENGTH }, () =>
    ALPHABET.charAt(randomInt(ALPHABET.length))
  ).join('');

  return `${prefix}-${suffix}`;
}
