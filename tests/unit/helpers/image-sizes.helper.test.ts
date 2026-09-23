import { describe, expect, it } from 'vitest';
import {
  buildCloudinarySizes,
  buildLocalSizes,
  singleSize,
} from '../../../src/helpers/image-sizes.helper.js';

/**
 * How the three responsive widths are formed differs per storage provider,
 * which is why they are stored rather than derived at read time (ADR-030).
 * Each branch is covered here, including the awkward URLs.
 */

describe('buildLocalSizes', () => {
  it('inserts the width before the extension, as the local driver writes them', () => {
    expect(buildLocalSizes('https://cdn.test/photo.jpg')).toEqual({
      sm: 'https://cdn.test/photo-480.jpg',
      md: 'https://cdn.test/photo-960.jpg',
      lg: 'https://cdn.test/photo-1440.jpg',
    });
  });

  it('appends when the URL has no extension', () => {
    expect(buildLocalSizes('https://cdn.test/photo').sm).toBe('https://cdn.test/photo-480');
  });

  it('is not fooled by a dot in a directory name', () => {
    expect(buildLocalSizes('https://cdn.test/v1.2/photo').sm).toBe('https://cdn.test/v1.2/photo-480');
  });
});

describe('buildCloudinarySizes', () => {
  it('inserts a transformation that crops around the focal point', () => {
    const sizes = buildCloudinarySizes('https://res.cloudinary.com/x/image/upload/v1/photo.jpg', {
      x: 0.25,
      y: 0.75,
    });

    expect(sizes.sm).toBe(
      'https://res.cloudinary.com/x/image/upload/w_480,c_fill,g_xy_center,x_0.25,y_0.75,f_auto,q_auto/v1/photo.jpg'
    );
    expect(sizes.lg).toContain('w_1440');
  });

  it('returns the URL unchanged when it is not a Cloudinary upload URL', () => {
    const url = 'https://placehold.co/1200x900';

    expect(buildCloudinarySizes(url, { x: 0.5, y: 0.5 })).toEqual({ sm: url, md: url, lg: url });
  });
});

describe('singleSize', () => {
  it('points every width at one URL, for sources with no variants', () => {
    expect(singleSize('https://cdn.test/one.png')).toEqual({
      sm: 'https://cdn.test/one.png',
      md: 'https://cdn.test/one.png',
      lg: 'https://cdn.test/one.png',
    });
  });
});
