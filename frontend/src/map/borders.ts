import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';

// Country borders drawn in our own color on top of the basemap (OpenFreeMap "boundary" layer,
// admin level 2, land borders only; maritime boundaries are skipped).
export const BORDERS_LAYER_ID = 'country-borders';
// Bright on the dark basemap and dark on the light one, so the border stands out from the fills.
export const BORDER_COLORS: Record<Theme, string> = { dark: '#ffd166', light: '#b45309' };

export function bordersLayerSpec(theme: Theme): LayerSpecification {
  return {
    id: BORDERS_LAYER_ID,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'boundary',
    filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
    paint: {
      'line-color': BORDER_COLORS[theme],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 3.5],
      'line-opacity': 1,
    },
  };
}

/** Adds the border layer if missing. Style changes drop custom layers, so call this on every style load. */
export function addBordersLayer(map: MapLibreMap, theme: Theme): void {
  if (!map.getLayer(BORDERS_LAYER_ID)) {
    map.addLayer(bordersLayerSpec(theme));
  }
}
