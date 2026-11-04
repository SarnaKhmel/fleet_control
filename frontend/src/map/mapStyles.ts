import type { Theme } from '../theme/themeStore';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// OpenFreeMap styles: free, no API key.
export const MAP_STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/fiord', // softer than black, reads well in the dark theme
  light: 'https://tiles.openfreemap.org/styles/positron',
  landscape: 'https://tiles.openfreemap.org/styles/bright', // green terrain and relief
} as const;

export type MapView = 'auto' | 'landscape';
export const MAP_VIEW_KEY = 'fleet.mapView';

interface MapViewState {
  view: MapView;
  setView: (view: MapView) => void;
  buildings3d: boolean;
  setBuildings3d: (on: boolean) => void;
}

export const useMapViewStore = create<MapViewState>()(
  persist(
    (set) => ({
      view: 'auto',
      setView: (view) => set({ view }),
      buildings3d: true,
      setBuildings3d: (buildings3d) => set({ buildings3d }),
    }),
    { name: MAP_VIEW_KEY },
  ),
);

/** Auto follows the UI theme; "landscape" always shows the terrain style. */
export function mapStyleFor(theme: Theme, view: MapView = 'auto'): string {
  if (view === 'landscape') return MAP_STYLE_URLS.landscape;
  return MAP_STYLE_URLS[theme];
}

export const DEFAULT_CENTER = { lat: 50.4501, lng: 30.5234 }; // Kyiv
export const DEFAULT_ZOOM = 10;
