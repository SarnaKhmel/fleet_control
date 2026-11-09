import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { LatLng } from '../../../shared/protocol.js';
import { toMetersFrom } from '../../../shared/mission/area.js';
import { boxOf, indexCache, isInside, type Outline } from '../outline.js';
import { createTileCache, pixelToLatLng, type Fetcher } from '../vectorTiles.js';

// Water for the simulator: lakes, seas and wide rivers (polygons of the OpenFreeMap "water" layer) and
// the narrow rivers drawn as lines ("waterway"), which count as water within RIVER_HALF_M of the line.
// Zoom 10 keeps a tile about 25 km wide: a mission's water is a few tiles, and the outlines are coarse
// enough for that. Until a tile is in, the water in it is unknown and reads as land.

export const WATER_ZOOM = 10;
/** Half the width of a river drawn as a line, meters: a point nearer its centerline is water. */
export const RIVER_HALF_M = 15;

export type WaterShape = { kind: 'area'; outline: Outline } | { kind: 'river'; line: LatLng[] };

export interface Water {
  /** True when the point lies on water (a loaded tile says so). */
  isWater(point: LatLng): boolean;
  /** Resolves once the tiles of these points are in (or have failed). */
  loaded(points: LatLng[]): Promise<void>;
}

/** No water anywhere: every point is land. */
export const NO_WATER: Water = { isWater: () => false, loaded: () => Promise.resolve() };

/** The water shapes of one vector tile. */
export function parseWaterTile(data: Uint8Array, x: number, y: number, zoom: number): WaterShape[] {
  const tile = new VectorTile(new PbfReader(data));
  const shapes: WaterShape[] = [];
  const toLatLng = (layer: { extent: number }, px: number, py: number) => pixelToLatLng(x, y, zoom, layer.extent, px, py);
  const area = tile.layers.water;
  if (area) {
    for (let i = 0; i < area.length; i++) {
      const feature = area.feature(i);
      if (feature.type !== 3) continue; // polygons only
      const rings = feature.loadGeometry().map((ring) => ring.map((p) => toLatLng(area, p.x, p.y)));
      shapes.push({ kind: 'area', outline: { rings, ...boxOf(rings) } });
    }
  }
  const lines = tile.layers.waterway;
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      const feature = lines.feature(i);
      if (feature.type !== 2) continue; // lines only
      for (const line of feature.loadGeometry()) shapes.push({ kind: 'river', line: line.map((p) => toLatLng(lines, p.x, p.y)) });
    }
  }
  return shapes;
}

/** Distance from the point to a segment of a line, meters (a flat map around the point is close enough here). */
function distanceToSegmentM(point: LatLng, a: LatLng, b: LatLng): number {
  const pa = toMetersFrom(point, a);
  const pb = toMetersFrom(point, b);
  const dx = pb.east - pa.east;
  const dy = pb.north - pa.north;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(pa.east * dx + pa.north * dy) / len2));
  return Math.hypot(pa.east + t * dx, pa.north + t * dy);
}

/** True when the point is on one shape. */
export function isOnShape(point: LatLng, shape: WaterShape): boolean {
  if (shape.kind === 'area') return isInside(point, shape.outline);
  for (let i = 0; i + 1 < shape.line.length; i++) {
    if (distanceToSegmentM(point, shape.line[i], shape.line[i + 1]) <= RIVER_HALF_M) return true;
  }
  return false;
}

/** The box around a shape; a river's is widened by its half width (0.0006° is over 15 m even in longitude at 70° latitude). */
function shapeBox(shape: WaterShape) {
  if (shape.kind === 'area') return shape.outline;
  const pad = 0.0006;
  const box = boxOf([shape.line]);
  return { south: box.south - pad, north: box.north + pad, west: box.west - pad, east: box.east + pad };
}

export function createWater(fetcher?: Fetcher, zoom = WATER_ZOOM): Water {
  const tiles = createTileCache('water', parseWaterTile, zoom, fetcher);
  const indexOf = indexCache<WaterShape>(shapeBox);
  return {
    isWater(point) {
      const shapes = tiles.itemsAt(point);
      return !!shapes && indexOf(shapes).near(point).some((shape) => isOnShape(point, shape));
    },
    loaded(points) {
      return Promise.all(points.map((point) => tiles.loaded(point))).then(() => undefined);
    },
  };
}
