import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';
import { areaRingFor, type MissionState } from './missionStore';
import { areaFromCorners, areaRing } from '../../../shared/mission/area';
import { MISSION_MAX_AREA_KM } from '../../../shared/protocol';

// Mission zone drawn as a dashed rectangle in our own style.
export const MISSION_SOURCE_ID = 'mission-area';
export const MISSION_LINE_ID = 'mission-area-line';
export const MISSION_COLORS: Record<Theme, string> = { dark: '#7ee787', light: '#1a7f37' };

/** Rectangle to draw: the live preview while drawing, else the committed zone. */
export function missionRing(state: MissionState) {
  if (state.drawing && state.drawAnchor && state.drawCursor) {
    const preview = areaFromCorners(state.drawAnchor, state.drawCursor, MISSION_MAX_AREA_KM);
    return areaRing({ ...preview, center: preview.center });
  }
  return areaRingFor(state);
}


/** Draws or updates the zone rectangle. */
export function syncMissionArea(map: MapLibreMap, state: MissionState, theme: Theme): void {
  const data = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [missionRing(state).map((p) => [p.lng, p.lat])] } }],
  };
  const source = map.getSource(MISSION_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  if (source?.setData) {
    source.setData(data);
  } else {
    map.addSource(MISSION_SOURCE_ID, { type: 'geojson', data: data as never });
    map.addLayer({
      id: MISSION_LINE_ID,
      type: 'line',
      source: MISSION_SOURCE_ID,
      paint: { 'line-color': MISSION_COLORS[theme], 'line-width': 2, 'line-dasharray': [4, 3] },
    });
  }
  map.setPaintProperty(MISSION_LINE_ID, 'line-color', MISSION_COLORS[theme]);
}

