/**
 * What a file *is*, read from its first bytes.
 *
 * The filename and the browser's `Content-Type` are both attacker-supplied, so
 * neither is evidence. This is the check that keeps `payload.exe` renamed to
 * `photo.png`, and an SVG full of script, out of the library (ADR-016).
 */

/** The image types the library accepts, in the order they are tested. */
const SIGNATURES: readonly { mimeType: string; matches: (bytes: Buffer) => boolean }[] = [
  {
    mimeType: 'image/jpeg',
    matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  {
    // RIFF....WEBP
    mimeType: 'image/webp',
    matches: (bytes) =>
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    // ISO-BMFF: "ftyp" at offset 4, then brands.
    //
    // The major brand at offset 8 is often `mif1`, with `avif` only in the
    // compatible-brands list that follows it — libavif and libheif both write
    // files that way — so matching the major brand alone rejects most real
    // AVIFs. The whole ftyp box is searched instead.
    mimeType: 'image/avif',
    matches: (bytes) => {
      if (bytes.subarray(4, 8).toString('latin1') !== 'ftyp') return false;

      const boxSize = bytes.readUInt32BE(0);
      const brands = bytes.subarray(8, Math.min(boxSize, bytes.length)).toString('latin1');

      return ['avif', 'avis'].some((brand) => brands.includes(brand));
    },
  },
];

/** Bytes needed before a verdict is possible. */
export const MAGIC_BYTES_NEEDED = 12;

/**
 * The real media type, or `undefined` when it is not one we accept.
 *
 * SVG is absent by design rather than by omission: it is XML, so it has no
 * magic number to match, and it would fail here even if it were listed.
 */
export function sniffImageType(buffer: Buffer): string | undefined {
  if (buffer.length < MAGIC_BYTES_NEEDED) return undefined;

  return SIGNATURES.find((signature) => signature.matches(buffer))?.mimeType;
}
