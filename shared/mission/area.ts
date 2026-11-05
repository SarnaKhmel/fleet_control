import type { LatLng, MissionArea } from '../protocol.js';

// Local equirectangular meters around the area center: accurate enough for a 200 km square.
const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

export function toMetersFrom(center: LatLng, point: LatLng): { east: number; north: number } {
  return {
    east: (point.lng - center.lng) * METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((center.lat * Math.PI) / 180),
    north: (point.lat - center.lat) * METERS_PER_DEG_LAT,
  };
}

/** True when the point lies inside the mission rectangle (edges included). */
export function isInsideArea(point: LatLng, area: MissionArea): boolean {
  const { east, north } = toMetersFrom(area.center, point);
  return Math.abs(east) <= (area.widthKm * 1000) / 2 && Math.abs(north) <= (area.heightKm * 1000) / 2;
}

/** The point `eastM` meters east and `northM` meters north of `center` (inverse of toMetersFrom). */
export function offsetLatLng(center: LatLng, eastM: number, northM: number): LatLng {
  return {
    lat: center.lat + northM / METERS_PER_DEG_LAT,
    lng: center.lng + eastM / (METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((center.lat * Math.PI) / 180)),
  };
}

/** Closed corner ring of the mission rectangle, for drawing. */
export function areaRing(area: MissionArea): LatLng[] {
  const halfW = (area.widthKm * 1000) / 2;
  const halfH = (area.heightKm * 1000) / 2;
  const corners = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ];
  const ring = corners.map(([e, n]) => offsetLatLng(area.center, e, n));
  return [...ring, ring[0]];
}

/** Zone from two opposite corners: its center and size in km, sizes clamped to [1, max] km. */
export function areaFromCorners(a: LatLng, b: LatLng, maxKm: number): { center: LatLng; widthKm: number; heightKm: number } {
  const { east, north } = toMetersFrom(a, b);
  const clamp = (km: number) => Math.min(maxKm, Math.max(1, km));
  return {
    center: offsetLatLng(a, east / 2, north / 2),
    widthKm: clamp(Math.abs(east) / 1000),
    heightKm: clamp(Math.abs(north) / 1000),
  };
}
