import type { LatLng } from '../../../shared/protocol.js';
import { decodePng, type RgbImage } from './png.js';
import { serverLog } from '../log.js';

// Ground elevation for the simulator, from the same public Terrarium tiles the map uses (AWS Open Data,
// no key). Tiles load in the background on first use; until a tile is in, its elevation is unknown
// (null) and the simulator keeps the last ground it knew. A tile that fails to load stays unknown.

export const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Zoom 12: about 38 m per pixel at the equator, 25 m at 50° latitude. Fine enough for hills and valleys.
export const TERRAIN_ZOOM = 12;
const TILE_SIZE = 256;

export interface Terrain {
  /** Ground elevation above sea level, meters, or null while its tile is not loaded. */
  elevationAt(point: LatLng): number | null;
}

/** Terrain that knows nothing: the simulator then treats the ground as level. */
export const NO_TERRAIN: Terrain = { elevationAt: () => null };

export type TileFetcher = (url: string) => Promise<Uint8Array>;

const fetchTile: TileFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** Terrarium encoding: (R * 256 + G + B / 256) - 32768 meters. */
export function terrariumElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Web Mercator tile and pixel of a point at `zoom`. */
export function tilePixel(point: LatLng, zoom: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const fx = ((point.lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.floor(fx));
  const y = Math.min(n - 1, Math.floor(fy));
  return { x, y, px: Math.min(TILE_SIZE - 1, Math.floor((fx - x) * TILE_SIZE)), py: Math.min(TILE_SIZE - 1, Math.floor((fy - y) * TILE_SIZE)) };
}

export function createTerrain(fetcher: TileFetcher = fetchTile, zoom = TERRAIN_ZOOM): Terrain {
  const tiles = new Map<string, RgbImage | 'loading' | 'failed'>();

  function load(key: string, x: number, y: number) {
    tiles.set(key, 'loading');
    const url = TERRAIN_TILE_URL.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
    fetcher(url)
      .then((data) => tiles.set(key, decodePng(data)))
      .catch((error: unknown) => {
        serverLog('terrain tile failed', { url, error: String(error) });
        tiles.set(key, 'failed');
      });
  }

  return {
    elevationAt(point) {
      const { x, y, px, py } = tilePixel(point, zoom);
      const key = `${x}/${y}`;
      const tile = tiles.get(key);
      if (tile === undefined) load(key, x, y);
      if (tile === undefined || tile === 'loading' || tile === 'failed') return null;
      const i = (py * tile.width + px) * tile.channels;
      return terrariumElevation(tile.pixels[i], tile.pixels[i + 1], tile.pixels[i + 2]);
    },
  };
}
