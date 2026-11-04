import type { Map as MapLibreMap } from 'maplibre-gl';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../theme/themeStore';

// Approximate front line: hand-traced zones from a screenshot, georeferenced by city points.
// Not survey data; the on-map attribution says so and links to DeepStateMap.live.
export const FRONT_LINE_URL = '/front-line/approximate.geojson';
export const FRONT_SOURCE_ID = 'front-line';
export const FRONT_FILL_ID = 'front-line-fill';
export const FRONT_LINE_ID = 'front-line-line';
export const FRONT_COLORS: Record<Theme, string> = { dark: '#ff9f43', light: '#c2410c' };

interface FrontLineState {
  enabled: boolean;
  zones: object | null;
  setEnabled: (enabled: boolean) => void;
  setZones: (zones: object) => void;
}

export const useFrontLineStore = create<FrontLineState>()(
  persist(
    (set) => ({
      enabled: false,
      zones: null,
      setEnabled: (enabled) => set({ enabled }),
      setZones: (zones) => set({ zones }),
    }),
    { name: 'fleet.frontLine', partialize: (state) => ({ enabled: state.enabled }) },
  ),
);

/** Loads the approximate zones once, when the layer is first switched on. */
export async function loadFrontLine(): Promise<void> {
  if (useFrontLineStore.getState().zones) return;
  try {
    const response = await fetch(FRONT_LINE_URL);
    if (!response.ok) return;
    useFrontLineStore.getState().setZones(await response.json());
  } catch {
    // Without zones the layer stays hidden; the toggle simply has nothing to show.
  }
}

export function removeFrontLine(map: MapLibreMap): void {
  for (const id of [FRONT_LINE_ID, FRONT_FILL_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(FRONT_SOURCE_ID)) map.removeSource(FRONT_SOURCE_ID);
}

/** Adds, updates or removes the front-line layers so they match the state. */
export function syncFrontLine(map: MapLibreMap, state: { enabled: boolean; zones: object | null; theme: Theme }): void {
  if (!state.enabled || !state.zones) {
    removeFrontLine(map);
    return;
  }
  const color = FRONT_COLORS[state.theme];
  const source = map.getSource(FRONT_SOURCE_ID) as { setData?: (data: unknown) => void } | undefined;
  if (source?.setData) {
    source.setData(state.zones);
  } else {
    map.addSource(FRONT_SOURCE_ID, { type: 'geojson', data: state.zones as never });
    map.addLayer({ id: FRONT_FILL_ID, type: 'fill', source: FRONT_SOURCE_ID, paint: { 'fill-color': color, 'fill-opacity': 0.12 } });
    map.addLayer({ id: FRONT_LINE_ID, type: 'line', source: FRONT_SOURCE_ID, paint: { 'line-color': color, 'line-width': 2 } });
  }
  map.setPaintProperty(FRONT_FILL_ID, 'fill-color', color);
  map.setPaintProperty(FRONT_LINE_ID, 'line-color', color);
}
