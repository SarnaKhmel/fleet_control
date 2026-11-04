import type { Map as MapLibreMap } from 'maplibre-gl';
import { isAirborne, type LatLng } from '../../../shared/protocol';
import { offsetLatLng } from '../../../shared/mission/area';
import type { Theme } from '../theme/themeStore';
import type { DroneView } from './missionStore';
import { WAYPOINT_COLORS } from './waypointLayer';

// A schematic view of each selected drone's camera: a cone from the drone forward along the way it
// moves, as wide as the camera's field of view and as long as the distance it can see.
export const CAMERA_SOURCE_ID = 'drone-camera';
export const CAMERA_FILL_ID = 'drone-camera-fill';
export const CAMERA_LINE_ID = 'drone-camera-line';
/** Horizontal field of view of the simulated camera, degrees. */
export const CAMERA_FOV_DEG = 60;
/** How far the simulated camera can make out a target, meters. */
export const CAMERA_RANGE_M = 1500;
// Points on the far arc: enough for a smooth edge at any zoom.
const ARC_STEPS = 16;

/** Closed ring of the cone: the drone, then the far arc from the left edge of the view to the right. */
export function cameraSector(position: LatLng, directionDeg: number, fovDeg = CAMERA_FOV_DEG, rangeM = CAMERA_RANGE_M): LatLng[] {
  const ring = [position];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const bearing = ((directionDeg - fovDeg / 2 + (fovDeg * i) / ARC_STEPS) * Math.PI) / 180;
    ring.push(offsetLatLng(position, rangeM * Math.sin(bearing), rangeM * Math.cos(bearing)));
  }
  ring.push(position);
  return ring;
}

/** GeoJSON with one camera sector for every selected drone that is in the air with a position and a heading. */
export function cameraFeatures(drones: Record<string, DroneView>, selectedIds: string[]) {
  const features = [];
  for (const droneId of selectedIds) {
    const drone = drones[droneId];
    // A drone on the ground (landed, lost, destroyed) has no view ahead to show.
    if (!drone?.position || drone.heading === null || !isAirborne(drone.status)) continue;
    // The nose is turned into the wind by the crab angle; the camera looks where the drone goes.
    const ring = cameraSector(drone.position, drone.heading - drone.crabDeg).map((p) => [p.lng, p.lat]);
    features.push({ type: 'Feature', properties: { droneId }, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Adds the (empty) camera source with a faint fill and an outline. Call it on every style load, before
 * the path layer so the paths stay on top. Like addWaypointLayer, it does not wait for isStyleLoaded().
 */
export function addCameraLayer(map: MapLibreMap, theme: Theme): void {
  if (map.getSource(CAMERA_SOURCE_ID)) return;
  map.addSource(CAMERA_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: CAMERA_FILL_ID,
    type: 'fill',
    source: CAMERA_SOURCE_ID,
    paint: { 'fill-color': WAYPOINT_COLORS[theme], 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: CAMERA_LINE_ID,
    type: 'line',
    source: CAMERA_SOURCE_ID,
    paint: { 'line-color': WAYPOINT_COLORS[theme], 'line-width': 1, 'line-opacity': 0.6 },
  });
}

/** Puts the current sectors into the source added by addCameraLayer; does nothing before it exists. */
export function syncCamera(map: MapLibreMap, drones: Record<string, DroneView>, selectedIds: string[], theme: Theme): void {
  const source = map.getSource(CAMERA_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (!source?.setData) return;
  source.setData(cameraFeatures(drones, selectedIds));
  map.setPaintProperty(CAMERA_FILL_ID, 'fill-color', WAYPOINT_COLORS[theme]);
  map.setPaintProperty(CAMERA_LINE_ID, 'line-color', WAYPOINT_COLORS[theme]);
}
