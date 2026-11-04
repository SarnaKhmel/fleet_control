import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';
import type { DroneView } from './missionStore';

// Each drone's path as a dashed line: from where it set off, through the drone, to its last task,
// with a dot on every task point.
export const WAYPOINT_SOURCE_ID = 'drone-waypoints';
export const WAYPOINT_LINE_ID = 'drone-waypoints-line';
export const WAYPOINT_POINT_ID = 'drone-waypoints-point';
// Same values as the --accent token of each theme (map layers cannot read CSS variables).
export const WAYPOINT_COLORS: Record<Theme, string> = { dark: '#4ea1ff', light: '#1f6feb' };

/** GeoJSON with a path and task points for every drone that has a position and tasks. */
export function waypointFeatures(drones: Record<string, DroneView>) {
  const features = [];
  for (const [droneId, drone] of Object.entries(drones)) {
    if (!drone.position || drone.tasks.length === 0) continue;
    const path = [...(drone.origin ? [drone.origin] : []), drone.position, ...drone.tasks].map((p) => [p.lng, p.lat]);
    features.push({ type: 'Feature', properties: { droneId }, geometry: { type: 'LineString', coordinates: path } });
    drone.tasks.forEach((p, index) => {
      features.push({ type: 'Feature', properties: { droneId, index }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Adds the path layers on first use, then only replaces their data and colors. Once the source exists
 * it is updated at any time: MapLibre reports the style as not loaded whenever any tiles are loading,
 * which would hold the paths back most of the time. Only adding the source waits for the style.
 */
export function syncWaypoints(map: MapLibreMap, drones: Record<string, DroneView>, theme: Theme): void {
  const data = waypointFeatures(drones);
  const source = map.getSource(WAYPOINT_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (source?.setData) {
    source.setData(data);
  } else {
    if (!map.isStyleLoaded()) return; // the style.load handler adds the source
    map.addSource(WAYPOINT_SOURCE_ID, { type: 'geojson', data: data as never });
    map.addLayer({
      id: WAYPOINT_LINE_ID,
      type: 'line',
      source: WAYPOINT_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': WAYPOINT_COLORS[theme], 'line-width': 2, 'line-dasharray': [2, 2] },
    });
    map.addLayer({
      id: WAYPOINT_POINT_ID,
      type: 'circle',
      source: WAYPOINT_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': WAYPOINT_COLORS[theme], 'circle-stroke-width': 2, 'circle-stroke-color': WAYPOINT_COLORS[theme], 'circle-stroke-opacity': 0.4 },
    });
  }
  map.setPaintProperty(WAYPOINT_LINE_ID, 'line-color', WAYPOINT_COLORS[theme]);
  map.setPaintProperty(WAYPOINT_POINT_ID, 'circle-color', WAYPOINT_COLORS[theme]);
}
