import type { Map as MapLibreMap } from 'maplibre-gl';
import { rangeOutline } from '../../../shared/flight/battery';
import type { Wind } from '../../../shared/flight/wind';
import { takesCommands } from '../../../shared/protocol';
import type { Theme } from '../theme/themeStore';
import type { DroneView } from './missionStore';
import { WAYPOINT_COLORS } from './waypointLayer';

// How far each selected drone can still fly on its charge: a dashed outline around it, stretched
// downwind and pulled in upwind (shared/flight/battery.ts). It follows the drone, its battery, its
// cruise speed and the wind.
export const RANGE_SOURCE_ID = 'drone-range';
export const RANGE_LINE_ID = 'drone-range-line';

/** GeoJSON with one range outline for every selected drone that still takes commands. */
export function rangeFeatures(drones: Record<string, DroneView>, selectedIds: string[], wind: Wind) {
  const features = [];
  for (const droneId of selectedIds) {
    const drone = drones[droneId];
    if (!drone?.position || !takesCommands(drone.status)) continue;
    const ring = rangeOutline(drone.position, drone.batteryPct, drone.cruiseSpeedMs, wind).map((p) => [p.lng, p.lat]);
    features.push({ type: 'Feature', properties: { droneId }, geometry: { type: 'LineString', coordinates: ring } });
  }
  return { type: 'FeatureCollection', features };
}

/** Adds the (empty) range source and its dashed outline. Call it on every style load, like the other layers. */
export function addRangeLayer(map: MapLibreMap, theme: Theme): void {
  if (map.getSource(RANGE_SOURCE_ID)) return;
  map.addSource(RANGE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: RANGE_LINE_ID,
    type: 'line',
    source: RANGE_SOURCE_ID,
    paint: { 'line-color': WAYPOINT_COLORS[theme], 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [6, 4] },
  });
}

/** Puts the current outlines into the source added by addRangeLayer; does nothing before it exists. */
export function syncRange(map: MapLibreMap, drones: Record<string, DroneView>, selectedIds: string[], wind: Wind, theme: Theme): void {
  const source = map.getSource(RANGE_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (!source?.setData) return;
  source.setData(rangeFeatures(drones, selectedIds, wind));
  map.setPaintProperty(RANGE_LINE_ID, 'line-color', WAYPOINT_COLORS[theme]);
}
