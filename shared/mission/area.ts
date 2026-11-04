import type { LatLng, MissionArea } from '../protocol';

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
