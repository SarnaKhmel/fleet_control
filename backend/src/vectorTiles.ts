import type { LatLng } from '../../shared/protocol.js';
import { tilePixel } from './terrain/terrain.js';
import { serverLog } from './log.js';

// Vector tiles of OpenFreeMap (the same planet tiles the map draws), read in the background like the
// terrain: until a tile is in, what it holds is unknown and nothing is reported there.

/** TileJSON of the OpenFreeMap planet tiles: it names the current tile URL (it changes with each data release). */
export const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
// Tiles kept in memory; the oldest are dropped past this (a tile is a few hundred kilobytes).
const MAX_TILES = 400;

export type Fetcher = (url: string) => Promise<Uint8Array>;

export const fetchBytes: Fetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** Point on the ground of a position inside a tile (the tile's pixel grid, `extent` wide), in degrees. */
export function pixelToLatLng(x: number, y: number, zoom: number, extent: number, px: number, py: number): LatLng {
  const n = 2 ** zoom;
  const fx = (x + px / extent) / n;
  const fy = (y + py / extent) / n;
  return { lng: fx * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI };
}

/** Tiles of one layer of the planet tiles, parsed into `T[]` per tile. */
export interface TileCache<T> {
  /** The tile's parsed items over the point, or null while the tile loads (or when it failed). */
  itemsAt(point: LatLng): T[] | null;
  /** Resolves once the point's tile is in (or has failed): asks for it if it was not asked for yet. */
  loaded(point: LatLng): Promise<void>;
}

/**
 * A cache of the tiles of one layer at one zoom. `parse` reads a tile's bytes (x, y, zoom given so the
 * outlines can be placed on the map).
 */
export function createTileCache<T>(
  name: string,
  parse: (data: Uint8Array, x: number, y: number, zoom: number) => T[],
  zoom: number,
  fetcher: Fetcher = fetchBytes,
): TileCache<T> {
  const tiles = new Map<string, T[] | 'failed'>();
  const pending = new Map<string, Promise<void>>();
  let template: Promise<string> | null = null;

  function tileTemplate(): Promise<string> {
    template ??= fetcher(OPENFREEMAP_TILEJSON_URL).then((data) => {
      const url = (JSON.parse(new TextDecoder().decode(data)) as { tiles?: unknown }).tiles;
      if (!Array.isArray(url) || typeof url[0] !== 'string') throw new Error('no tile URL in TileJSON');
      return url[0];
    });
    return template;
  }

  function load(key: string, x: number, y: number): Promise<void> {
    if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value!);
    const request = tileTemplate()
      .then((url) => fetcher(url.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y))))
      .then((data) => {
        tiles.set(key, parse(data, x, y, zoom));
      })
      .catch((error: unknown) => {
        serverLog(`${name} tile failed`, { key, error: String(error) });
        tiles.set(key, 'failed');
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  function keyOf(point: LatLng) {
    const { x, y } = tilePixel(point, zoom);
    return { key: `${x}/${y}`, x, y };
  }

  return {
    itemsAt(point) {
      const { key, x, y } = keyOf(point);
      if (!tiles.has(key) && !pending.has(key)) load(key, x, y);
      const tile = tiles.get(key);
      return Array.isArray(tile) ? tile : null;
    },
    loaded(point) {
      const { key, x, y } = keyOf(point);
      if (!tiles.has(key) && !pending.has(key)) load(key, x, y);
      return pending.get(key) ?? Promise.resolve();
    },
  };
}
