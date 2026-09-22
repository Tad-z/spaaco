import { IMAGE_SIZES } from '../config/constants.js';

/**
 * Builds the three responsive URLs stored on a Media record.
 *
 * Sizes are stored rather than derived at read time, because how they are
 * formed depends on where the file lives: the local driver writes three files
 * beside the original, Cloudinary expresses them as transformations, and the
 * dev seed points all three at placehold.co. A serializer cannot know which
 * rule applies, so whatever created the record records the answer.
 *
 * Cloudinary sizes are rebuilt when the focal point changes, since gravity is
 * part of the transformation.
 */

export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

export interface ResponsiveSizes {
  sm: string;
  md: string;
  lg: string;
}

const WIDTHS = [
  ['sm', IMAGE_SIZES.sm],
  ['md', IMAGE_SIZES.md],
  ['lg', IMAGE_SIZES.lg],
] as const;

const build = (make: (width: number) => string): ResponsiveSizes => ({
  sm: make(WIDTHS[0][1]),
  md: make(WIDTHS[1][1]),
  lg: make(WIDTHS[2][1]),
});

/** `/photo.jpg` → `/photo-480.jpg`, matching what the local driver writes. */
export function buildLocalSizes(url: string): ResponsiveSizes {
  const lastDot = url.lastIndexOf('.');
  const lastSlash = url.lastIndexOf('/');

  // No extension (or a dot only in a directory name): append instead.
  if (lastDot <= lastSlash) return build((width) => `${url}-${String(width)}`);

  const stem = url.slice(0, lastDot);
  const extension = url.slice(lastDot);
  return build((width) => `${stem}-${String(width)}${extension}`);
}

/**
 * Insert a Cloudinary transformation after `/upload/`, cropping around the
 * focal point so a portrait is not beheaded at narrow widths.
 */
export function buildCloudinarySizes(url: string, focalPoint: FocalPoint): ResponsiveSizes {
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return build(() => url);

  const head = url.slice(0, at + marker.length);
  const tail = url.slice(at + marker.length);
  const gravity = `g_xy_center,x_${focalPoint.x.toFixed(2)},y_${focalPoint.y.toFixed(2)}`;

  return build((width) => `${head}w_${String(width)},c_fill,${gravity},f_auto,q_auto/${tail}`);
}

/** Point all three widths at one URL, for sources that have no variants. */
export const singleSize = (url: string): ResponsiveSizes => build(() => url);
