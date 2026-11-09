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

/** The outline's box, from its rings. A loop, not `Math.min(...)`: a big outline has more points than a call can take. */
export function boxOf(rings: LatLng[][]): Omit<Outline, 'rings'> {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
      if (p.lng < west) west = p.lng;
      if (p.lng > east) east = p.lng;
    }
  }
  return { south, north, west, east };
}

type Box = Omit<Outline, 'rings'>;

/** Items of a tile bucketed by a grid over their boxes, so a point lookup reads a few items, not the whole tile. */
export interface GridIndex<T> {
  /** The items whose box may hold the point, in their original order. */
  near(point: LatLng): readonly T[];
}

const NONE: readonly never[] = [];

export function createGridIndex<T>(items: readonly T[], box: (item: T) => Box, cells = 32): GridIndex<T> {
  const boxes = items.map(box);
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const b of boxes) {
    south = Math.min(south, b.south);
    north = Math.max(north, b.north);
    west = Math.min(west, b.west);
    east = Math.max(east, b.east);
  }
  const stepLat = (north - south) / cells || 1;
  const stepLng = (east - west) / cells || 1;
  const clamp = (n: number) => Math.max(0, Math.min(cells - 1, n));
  const buckets: T[][] = Array.from({ length: cells * cells }, () => []);
  items.forEach((item, i) => {
    const b = boxes[i];
    for (let row = clamp(Math.floor((b.south - south) / stepLat)); row <= clamp(Math.floor((b.north - south) / stepLat)); row++) {
      for (let col = clamp(Math.floor((b.west - west) / stepLng)); col <= clamp(Math.floor((b.east - west) / stepLng)); col++) {
        buckets[row * cells + col].push(item);
      }
    }
  });
  return {
    near(point) {
      if (point.lat < south || point.lat > north || point.lng < west || point.lng > east) return NONE;
      const row = clamp(Math.floor((point.lat - south) / stepLat));
      const col = clamp(Math.floor((point.lng - west) / stepLng));
      return buckets[row * cells + col];
    },
  };
}

/** Builds the index of a tile's items once: the tile cache returns the same array for a tile every time. */
export function indexCache<T>(box: (item: T) => Box): (items: readonly T[]) => GridIndex<T> {
  const indexes = new WeakMap<readonly T[], GridIndex<T>>();
  return (items) => {
    let index = indexes.get(items);
    if (!index) {
      index = createGridIndex(items, box);
      indexes.set(items, index);
    }
    return index;
  };
}
