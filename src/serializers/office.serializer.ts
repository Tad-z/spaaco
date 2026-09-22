import type { Office as OfficePayload, OfficeRef } from '../types/api.js';
import type { IOffice } from '../interfaces/office.interface.js';

export type PopulatedOffice = IOffice & { _id: { toString: () => string } };

export function toRef(office: PopulatedOffice): OfficeRef {
  return { id: office._id.toString(), slug: office.slug, name: office.name };
}

export function toOffice(office: PopulatedOffice): OfficePayload {
  return {
    ...toRef(office),
    address: office.address,
    hours: office.hours,
    phone: office.phone ?? null,
    email: office.email ?? null,
    // Stored as GeoJSON [lng, lat]; served as { lat, lng }, because a reversed
    // pair is a classic and silent frontend bug (ADR-020).
    coordinates: office.location
      ? { lng: office.location.coordinates[0], lat: office.location.coordinates[1] }
      : null,
    directionsUrl: office.directionsUrl ?? null,
  };
}
