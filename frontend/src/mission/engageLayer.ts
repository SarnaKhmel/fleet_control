import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MissionUnit } from '../../../shared/mission/units';
import type { Theme } from '../theme/themeStore';
import type { DroneView } from './missionStore';

// The way a selected drone takes to its target while it engages: a dashed line from the drone to the unit,
// which follows both as they move.
export const ENGAGE_SOURCE_ID = 'drone-engage';
export const ENGAGE_LINE_ID = 'drone-engage-line';
// Same values as the --danger token of each theme (map layers cannot read CSS variables).
export const ENGAGE_COLORS: Record<Theme, string> = { dark: '#e5484d', light: '#d93036', tactical: '#e0524b' };

/** GeoJSON with one line per selected drone that is engaging a unit still on the map and not destroyed. */
export function engageFeatures(drones: Record<string, DroneView>, units: Record<string, MissionUnit>, selectedIds: string[]) {
  const features = [];
  for (const droneId of selectedIds) {
    const drone = drones[droneId];
    const unit = drone?.targetId ? units[drone.targetId] : undefined;
    if (!drone?.position || drone.status !== 'engaging' || !unit || unit.destroyed) continue;
    const coordinates = [
      [drone.position.lng, drone.position.lat],
      [unit.position.lng, unit.position.lat],
    ];
    features.push({ type: 'Feature', properties: { droneId, targetId: unit.id }, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

/** Adds the (empty) engage source and its dashed line. Call it on every style load, like the other layers. */
export function addEngageLayer(map: MapLibreMap, theme: Theme): void {
  if (map.getSource(ENGAGE_SOURCE_ID)) return;
  map.addSource(ENGAGE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: ENGAGE_LINE_ID,
    type: 'line',
    source: ENGAGE_SOURCE_ID,
    paint: { 'line-color': ENGAGE_COLORS[theme], 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [3, 3] },
  });
}

/** Puts the current lines into the source added by addEngageLayer; does nothing before it exists. */
export function syncEngage(map: MapLibreMap, drones: Record<string, DroneView>, units: Record<string, MissionUnit>, selectedIds: string[], theme: Theme): void {
  const source = map.getSource(ENGAGE_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (!source?.setData) return;
  source.setData(engageFeatures(drones, units, selectedIds));
  map.setPaintProperty(ENGAGE_LINE_ID, 'line-color', ENGAGE_COLORS[theme]);
}
