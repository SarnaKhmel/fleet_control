import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../location/locationStore';

// Terrain from public Terrarium-encoded elevation tiles (AWS Open Data, no API key).
export const TERRAIN_SOURCE_ID = 'terrain-dem';
export const TERRAIN_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_EXAGGERATION = 1;

export function addTerrain(map: MapLibreMap): void {
  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES_URL],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 14,
      attribution: 'Elevation: Mapzen, USGS, SRTM, AWS Open Data',
    });
  }
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
}

/** Ground elevation in meters above sea level at a point, or null while tiles are still loading. */
export function groundElevationAt(map: MapLibreMap, point: LatLng): number | null {
  return map.queryTerrainElevation([point.lng, point.lat]);
}
