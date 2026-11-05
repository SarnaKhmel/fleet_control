import type { LatLng } from '../../shared/protocol.js';

/** An area on the ground: its outline rings (outer ones and holes) and the box around them, degrees. */
export interface Outline {
  /** Outline rings: the outer ones and any holes (read with the even-odd rule). */
  rings: LatLng[][];
  south: number;
  north: number;
  west: number;
  east: number;
}

/** Even-odd point-in-polygon over all rings (holes fall out of the count). */
export function isInside(point: LatLng, outline: Outline): boolean {
  if (point.lat < outline.south || point.lat > outline.north || point.lng < outline.west || point.lng > outline.east) return false;
  let inside = false;
  for (const ring of outline.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.lat > point.lat !== b.lat > point.lat && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** The outline's box, from its rings. */
export function boxOf(rings: LatLng[][]): Omit<Outline, 'rings'> {
  const points = rings.flat();
  return {
    south: Math.min(...points.map((p) => p.lat)),
    north: Math.max(...points.map((p) => p.lat)),
    west: Math.min(...points.map((p) => p.lng)),
    east: Math.max(...points.map((p) => p.lng)),
  };
}
