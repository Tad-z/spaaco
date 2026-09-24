import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sniffImageType } from '../../../src/helpers/image-type.helper.js';

/**
 * The only check that cannot be talked out of its answer.
 *
 * Real encoder output rather than hand-written headers: a signature table that
 * matches a byte sequence nobody's encoder actually emits would pass its own
 * test and reject every real upload.
 */

const sample = (format: 'png' | 'jpeg' | 'webp' | 'avif'): Promise<Buffer> =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: '#654321' } })
    .toFormat(format)
    .toBuffer();

describe('sniffImageType', () => {
  it.each(['png', 'jpeg', 'webp', 'avif'] as const)('recognises a real %s', async (format) => {
    expect(sniffImageType(await sample(format))).toBe(`image/${format}`);
  });

  it('does not recognise an SVG, whatever it is called', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    expect(sniffImageType(svg)).toBeUndefined();
  });

  it('does not recognise an executable', () => {
    expect(sniffImageType(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]))).toBeUndefined();
  });

  it('does not recognise a PDF', () => {
    expect(sniffImageType(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3'))).toBeUndefined();
  });

  it('is not fooled by image bytes hidden after a different header', async () => {
    const png = await sample('png');
    const disguised = Buffer.concat([Buffer.from('MZ'), png]);

    expect(sniffImageType(disguised)).toBeUndefined();
  });

  it('returns undefined for a file too short to have a signature', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeUndefined();
  });
});
