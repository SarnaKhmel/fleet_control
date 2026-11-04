import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';
import { areaRingFor, type MissionState } from './missionStore';
import { areaFromCorners, areaRing } from '../../../shared/mission/area';
import { MISSION_MAX_AREA_KM } from '../../../shared/protocol';

// Mission zone drawn as a dashed rectangle in our own style.
export const MISSION_SOURCE_ID = 'mission-area';
export const MISSION_LINE_ID = 'mission-area-line';
export const MISSION_FILL_ID = 'mission-area-fill';
export const MISSION_COLORS: Record<Theme, string> = { dark: '#7ee787', light: '#1a7f37' };

/** Rectangle to draw: the live preview while drawing, else the committed zone. */
export function missionRing(state: MissionState) {
  if (state.drawing && state.drawAnchor && state.drawCursor) {
    const preview = areaFromCorners(state.drawAnchor, state.drawCursor, MISSION_MAX_AREA_KM);
    return areaRing({ ...preview, center: preview.center });
  }
  return areaRingFor(state);
}


/** Removes the zone rectangle from the map. */
export function removeMissionArea(map: MapLibreMap): void {
  if (map.getLayer(MISSION_LINE_ID)) map.removeLayer(MISSION_LINE_ID);
  if (map.getLayer(MISSION_FILL_ID)) map.removeLayer(MISSION_FILL_ID);
  if (map.getSource(MISSION_SOURCE_ID)) map.removeSource(MISSION_SOURCE_ID);
}

/**
 * Draws the zone once it is chosen (drawn, or sized or centered), while it is being drawn, and while a
 * mission runs. The untouched default zone stays off the map until the operator chooses it.
 */
export function syncMissionArea(map: MapLibreMap, state: MissionState, theme: Theme): void {
  if (!state.drawing && state.phase !== 'running' && !state.zoneChosen) {
    removeMissionArea(map);
    return;
  }
  const data = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [missionRing(state).map((p) => [p.lng, p.lat])] } }],
  };
  const source = map.getSource(MISSION_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (source?.setData) {
    source.setData(data);
  } else {
    map.addSource(MISSION_SOURCE_ID, { type: 'geojson', data: data as never });
    // A faint fill keeps the zone visible even when its edges lie beyond the screen.
    map.addLayer({ id: MISSION_FILL_ID, type: 'fill', source: MISSION_SOURCE_ID, paint: { 'fill-color': MISSION_COLORS[theme], 'fill-opacity': 0.08 } });
    map.addLayer({
      id: MISSION_LINE_ID,
      type: 'line',
      source: MISSION_SOURCE_ID,
      paint: { 'line-color': MISSION_COLORS[theme], 'line-width': 2, 'line-dasharray': [4, 3] },
    });
  }
  map.setPaintProperty(MISSION_LINE_ID, 'line-color', MISSION_COLORS[theme]);
  map.setPaintProperty(MISSION_FILL_ID, 'fill-color', MISSION_COLORS[theme]);
}

