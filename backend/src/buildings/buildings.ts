import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { LatLng } from '../../../shared/protocol.js';
import { tilePixel } from '../terrain/terrain.js';
import { serverLog } from '../log.js';

// Buildings for the simulator, from the same OpenFreeMap vector tiles the map draws in 3D (layer
// "building", heights in render_height). Tiles load in the background on first use, like the terrain:
// until a tile is in, its buildings are unknown and nothing is reported there.

/** TileJSON of the OpenFreeMap planet tiles: it names the current tile URL (it changes with each data release). */
export const BUILDINGS_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
// Zoom 14: the most detailed level, where every building is in the tiles.
export const BUILDINGS_ZOOM = 14;
// Tiles kept in memory; the oldest are dropped past this (a tile is a few hundred kilobytes).
const MAX_TILES = 400;
// Height given to a building whose tile does not say (rare in OpenFreeMap data).
const DEFAULT_HEIGHT_M = 10;

export interface Building {
  /** Outline rings: the outer ones and any holes (read with the even-odd rule). */
  rings: LatLng[][];
  /** Height of its top above the ground, meters. */
  heightM: number;
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface Buildings {
  /** The tallest known building over the point, or null (none there, or its tile is not loaded yet). */
  at(point: LatLng): Building | null;
}

/** Buildings that know nothing: no obstacles anywhere. */
export const NO_BUILDINGS: Buildings = { at: () => null };

export type Fetcher = (url: string) => Promise<Uint8Array>;

const fetchBytes: Fetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** The buildings of one vector tile, outlines in degrees. */
export function parseBuildingTile(data: Uint8Array, x: number, y: number, zoom: number): Building[] {
  const layer = new VectorTile(new PbfReader(data)).layers.building;
  if (!layer) return [];
  const n = 2 ** zoom;
  const toLatLng = (px: number, py: number): LatLng => {
    const fx = (x + px / layer.extent) / n;
    const fy = (y + py / layer.extent) / n;
    return { lng: fx * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI };
  };
  const buildings: Building[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 3) continue; // polygons only
    const rings = feature.loadGeometry().map((ring) => ring.map((p) => toLatLng(p.x, p.y)));
    const points = rings.flat();
    const height = feature.properties.render_height;
    buildings.push({
      rings,
      heightM: typeof height === 'number' && height > 0 ? height : DEFAULT_HEIGHT_M,
      south: Math.min(...points.map((p) => p.lat)),
      north: Math.max(...points.map((p) => p.lat)),
      west: Math.min(...points.map((p) => p.lng)),
      east: Math.max(...points.map((p) => p.lng)),
    });
  }
  return buildings;
}

/** Even-odd point-in-polygon over all rings (holes fall out of the count). */
export function isInside(point: LatLng, building: Building): boolean {
  if (point.lat < building.south || point.lat > building.north || point.lng < building.west || point.lng > building.east) return false;
  let inside = false;
  for (const ring of building.rings) {
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

export function createBuildings(fetcher: Fetcher = fetchBytes, zoom = BUILDINGS_ZOOM): Buildings {
  const tiles = new Map<string, Building[] | 'loading' | 'failed'>();
  let template: Promise<string> | null = null;

  function tileTemplate(): Promise<string> {
    template ??= fetcher(BUILDINGS_TILEJSON_URL).then((data) => {
      const url = (JSON.parse(new TextDecoder().decode(data)) as { tiles?: unknown }).tiles;
      if (!Array.isArray(url) || typeof url[0] !== 'string') throw new Error('no tile URL in TileJSON');
      return url[0];
    });
    return template;
  }

  function load(key: string, x: number, y: number) {
    tiles.set(key, 'loading');
    if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value!);
    tileTemplate()
      .then((url) => fetcher(url.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y))))
      .then((data) => tiles.set(key, parseBuildingTile(data, x, y, zoom)))
      .catch((error: unknown) => {
        serverLog('buildings tile failed', { key, error: String(error) });
        tiles.set(key, 'failed');
      });
  }

  return {
    at(point) {
      const { x, y } = tilePixel(point, zoom);
      const key = `${x}/${y}`;
      const tile = tiles.get(key);
      if (tile === undefined) load(key, x, y);
      if (!Array.isArray(tile)) return null;
      let tallest: Building | null = null;
      for (const building of tile) {
        if ((!tallest || building.heightM > tallest.heightM) && isInside(point, building)) tallest = building;
      }
      return tallest;
    },
  };
}
