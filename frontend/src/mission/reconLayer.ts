import type { Map as MapLibreMap } from 'maplibre-gl';
import { rowRuns, runRing, type ReconCell, type ReconGrid } from '../../../shared/mission/recon';
import type { Theme } from '../theme/themeStore';

// The ground the drone cameras have seen this mission, as a faint fill under the paths and cones.
// Neighbouring cells of a row are drawn as one rectangle, so a long flight is a few shapes, not thousands.
export const RECON_SOURCE_ID = 'recon-area';
export const RECON_FILL_ID = 'recon-area-fill';
// Same values as the --muted token of each theme (map layers cannot read CSS variables).
export const RECON_COLORS: Record<Theme, string> = { dark: '#8a99b3', light: '#5b6b85', tactical: '#8a99b3' };

/** GeoJSON with one rectangle per run of seen cells in a row. */
export function reconFeatures(grid: ReconGrid | null, cells: ReconCell[]) {
  if (!grid) return { type: 'FeatureCollection', features: [] };
  const features = rowRuns(cells).map(([row, fromX, toX]) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [runRing(grid, row, fromX, toX).map((p) => [p.lng, p.lat])] },
  }));
  return { type: 'FeatureCollection', features };
}

/** Adds the (empty) reconnaissance source and fill. Call it on every style load, before the drone layers. */
export function addReconLayer(map: MapLibreMap, theme: Theme): void {
  if (map.getSource(RECON_SOURCE_ID)) return;
  map.addSource(RECON_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: RECON_FILL_ID,
    type: 'fill',
    source: RECON_SOURCE_ID,
    paint: { 'fill-color': RECON_COLORS[theme], 'fill-opacity': 0.22 },
  });
}

/** Puts the seen ground into the source added by addReconLayer; does nothing before it exists. */
export function syncRecon(map: MapLibreMap, grid: ReconGrid | null, cells: ReconCell[], theme: Theme): void {
  const source = map.getSource(RECON_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (!source?.setData) return;
  source.setData(reconFeatures(grid, cells));
  map.setPaintProperty(RECON_FILL_ID, 'fill-color', RECON_COLORS[theme]);
}
