import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';

// 3D buildings from the OpenFreeMap vector tiles (source "openmaptiles", layer "building").
// Heights come from the tile properties render_height / render_min_height.
export const BUILDINGS_LAYER_ID = '3d-buildings';
export const BUILDING_COLORS: Record<Theme, string> = { dark: '#4a5a78', light: '#cfc9bf', tactical: '#4a5a78' };
export const TILT_3D_PITCH = 50;

export function buildingsLayerSpec(theme: Theme): LayerSpecification {
  return {
    id: BUILDINGS_LAYER_ID,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': BUILDING_COLORS[theme],
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-base': ['get', 'render_min_height'],
      'fill-extrusion-opacity': 0.85,
    },
  };
}

/** Adds the layer if missing. Style changes remove custom layers, so call this on every style load. */
export function addBuildingsLayer(map: MapLibreMap, theme: Theme): void {
  if (!map.getLayer(BUILDINGS_LAYER_ID)) {
    map.addLayer(buildingsLayerSpec(theme));
  }
}
