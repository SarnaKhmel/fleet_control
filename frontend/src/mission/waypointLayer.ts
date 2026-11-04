import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../../../shared/protocol';
import type { Theme } from '../theme/themeStore';
import type { DroneView } from './missionStore';

// Paths of the selected drones as dashed lines: the flown part (from where the drone set off, through
// the points it reached, to the drone) is faint; the part still ahead (to its last task) is bright.
// The task points themselves are draggable markers (taskMarkers.ts).
export const WAYPOINT_SOURCE_ID = 'drone-waypoints';
export const WAYPOINT_LINE_ID = 'drone-waypoints-line';
// Same values as the --accent token of each theme (map layers cannot read CSS variables).
export const WAYPOINT_COLORS: Record<Theme, string> = { dark: '#4ea1ff', light: '#1f6feb' };

const line = (points: LatLng[]) => ({ type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) });

/** GeoJSON with a flown and an ahead line for every selected drone that has them. */
export function waypointFeatures(drones: Record<string, DroneView>, selectedIds: string[]) {
  const features = [];
  for (const droneId of selectedIds) {
    const drone = drones[droneId];
    if (!drone?.position) continue;
    if (drone.trail.length > 0) {
      features.push({ type: 'Feature', properties: { droneId, part: 'flown' }, geometry: line([...drone.trail, drone.position]) });
    }
    if (drone.tasks.length > 0) {
      features.push({ type: 'Feature', properties: { droneId, part: 'ahead' }, geometry: line([drone.position, ...drone.tasks]) });
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Adds the (empty) path source and its dashed line layer. Call it on every style load, like the other
 * custom layers: a style change drops them. Do not wait for map.isStyleLoaded() here: MapLibre fires
 * style.load before the style's own sources have loaded, so it is still false at that point.
 */
export function addWaypointLayer(map: MapLibreMap, theme: Theme): void {
  if (map.getSource(WAYPOINT_SOURCE_ID)) return;
  map.addSource(WAYPOINT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: WAYPOINT_LINE_ID,
    type: 'line',
    source: WAYPOINT_SOURCE_ID,
    paint: {
      'line-color': WAYPOINT_COLORS[theme],
      'line-width': 2,
      'line-dasharray': [2, 2],
      'line-opacity': ['match', ['get', 'part'], 'flown', 0.4, 1],
    },
  });
}

/**
 * Puts the current paths into the source added by addWaypointLayer. It works at any time once the
 * source exists, also while map tiles load; before the style has loaded there is nothing to update yet.
 */
export function syncWaypoints(map: MapLibreMap, drones: Record<string, DroneView>, selectedIds: string[], theme: Theme): void {
  const source = map.getSource(WAYPOINT_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (!source?.setData) return;
  source.setData(waypointFeatures(drones, selectedIds));
  map.setPaintProperty(WAYPOINT_LINE_ID, 'line-color', WAYPOINT_COLORS[theme]);
}
