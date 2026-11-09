import type { LatLng } from '../../../shared/protocol.js';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { createTileCache, pixelToLatLng, type Fetcher } from '../vectorTiles.js';
import { boxOf, indexCache, isInside, type Outline } from '../outline.js';

export { isInside };

// Buildings for the simulator, from the same OpenFreeMap vector tiles the map draws in 3D (layer
// "building", heights in render_height). Tiles load in the background on first use, like the terrain:
// until a tile is in, its buildings are unknown and nothing is reported there.

// Zoom 14: the most detailed level, where every building is in the tiles.
export const BUILDINGS_ZOOM = 14;
// Height given to a building whose tile does not say (rare in OpenFreeMap data).
const DEFAULT_HEIGHT_M = 10;

export interface Building extends Outline {
  /** Height of its top above the ground, meters. */
  heightM: number;
}

export interface Buildings {
  /** The tallest known building over the point, or null (none there, or its tile is not loaded yet). */
  at(point: LatLng): Building | null;
}

/** Buildings that know nothing: no obstacles anywhere. */
export const NO_BUILDINGS: Buildings = { at: () => null };

/** The buildings of one vector tile, outlines in degrees. */
export function parseBuildingTile(data: Uint8Array, x: number, y: number, zoom: number): Building[] {
  const layer = new VectorTile(new PbfReader(data)).layers.building;
  if (!layer) return [];
  const buildings: Building[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 3) continue; // polygons only
    const rings = feature.loadGeometry().map((ring) => ring.map((p) => pixelToLatLng(x, y, zoom, layer.extent, p.x, p.y)));
    const height = feature.properties.render_height;
    buildings.push({ rings, ...boxOf(rings), heightM: typeof height === 'number' && height > 0 ? height : DEFAULT_HEIGHT_M });
  }
  return buildings;
}

export function createBuildings(fetcher?: Fetcher, zoom = BUILDINGS_ZOOM): Buildings {
  const tiles = createTileCache('buildings', parseBuildingTile, zoom, fetcher);
  const indexOf = indexCache<Building>((building) => building);
  return {
    at(point) {
      const items = tiles.itemsAt(point);
      if (!items) return null;
      let tallest: Building | null = null;
      for (const building of indexOf(items).near(point)) {
        if ((!tallest || building.heightM > tallest.heightM) && isInside(point, building)) tallest = building;
      }
      return tallest;
    },
  };
}
