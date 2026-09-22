import type { IContentFields } from './common.interface.js';

/** GeoJSON Point, stored `[lng, lat]` and served as `{ lat, lng }` (ADR-020). */
export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface IOffice extends IContentFields {
  /** Bare city name; the UI renders "Lagos Office". */
  name: string;
  address: string;
  /** Null until the firm supplies real coordinates for the map pin. */
  location?: IGeoPoint | null;
  directionsUrl?: string | null;
  hours: string;
  /** Falls back to the site-wide value when empty. */
  phone?: string | null;
  email?: string | null;
}
