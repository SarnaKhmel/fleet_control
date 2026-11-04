import { create } from 'zustand';

export interface LatLng {
  lat: number;
  lng: number;
}

interface LocationState {
  selected: LatLng | null;
  select: (point: LatLng) => void;
  clear: () => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  selected: null,
  select: (point) => set({ selected: point }),
  clear: () => set({ selected: null }),
}));

export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
