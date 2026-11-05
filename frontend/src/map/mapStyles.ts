import type { StyleSpecification } from 'maplibre-gl';
import type { Theme } from '../theme/themeStore';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// OpenFreeMap styles: free, no API key.
export const MAP_STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/fiord', // softer than black, reads well in the dark theme
  light: 'https://tiles.openfreemap.org/styles/positron',
  landscape: 'https://tiles.openfreemap.org/styles/bright', // green terrain and relief
} as const;

export type MapView = 'auto' | 'landscape' | 'satellite';

// Esri World Imagery under the same OpenFreeMap vector source ("openmaptiles") the other styles use, so the
// 3D buildings and the borders still draw over the imagery. Esri tiles are {z}/{y}/{x}, no API key needed.
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
};
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
      buildings3d: false,
      setBuildings3d: (buildings3d) => set({ buildings3d }),
    }),
    { name: MAP_VIEW_KEY },
  ),
);

/** Auto follows the UI theme; "landscape" always shows the terrain style; "satellite" the imagery. */
export function mapStyleFor(theme: Theme, view: MapView = 'auto'): string | StyleSpecification {
  if (view === 'satellite') return SATELLITE_STYLE;
  if (view === 'landscape') return MAP_STYLE_URLS.landscape;
  return MAP_STYLE_URLS[theme];
}

/** Which style is shown: a change of this key is a change of the basemap. */
export function mapStyleKey(theme: Theme, view: MapView = 'auto'): string {
  return view === 'auto' ? theme : view;
}


export const DEFAULT_CENTER = { lat: 50.4501, lng: 30.5234 }; // Kyiv
export const DEFAULT_ZOOM = 10;
