import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LatLng {
  lat: number;
  lng: number;
}

export const SAVED_LOCATIONS_KEY = 'fleet.savedLocations';

interface LocationState {
  selected: LatLng | null;
  /** Terrain elevation at `selected` in meters above sea level, once known. */
  groundM: number | null;
  setGround: (meters: number | null) => void;
  /** Bumps when a location is chosen outside the map (header, saved list): the map flies there. */
  focusTick: number;
  saved: LatLng[];
  /** Map click: moves the marker only. */
  select: (point: LatLng) => void;
  /** Header or saved list: moves the marker and focuses the map. */
  choose: (point: LatLng) => void;
  clear: () => void;
  save: () => void;
  removeSaved: (index: number) => void;
}

function sameSpot(a: LatLng, b: LatLng): boolean {
  return formatLatLng(a) === formatLatLng(b);
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      selected: null,
      groundM: null,
      setGround: (groundM) => set({ groundM }),
      focusTick: 0,
      saved: [],
      select: (point) => set({ selected: point, groundM: null }),
      choose: (point) => set({ selected: point, groundM: null, focusTick: get().focusTick + 1 }),
      clear: () => set({ selected: null, groundM: null }),
      save: () => {
        const { selected, saved } = get();
        if (!selected || saved.some((item) => sameSpot(item, selected))) return;
        set({ saved: [...saved, selected] });
      },
      removeSaved: (index) => set({ saved: get().saved.filter((_, i) => i !== index) }),
    }),
    {
      name: SAVED_LOCATIONS_KEY,
      partialize: (state) => ({ saved: state.saved }),
    },
  ),
);

export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
