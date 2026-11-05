import { create } from 'zustand';

// Map readouts shown over the map: the scale and the bearing (degrees the map is turned from north).
interface MapScaleState {
  metersPerPx: number | null;
  bearing: number;
  setMetersPerPx: (value: number) => void;
  setBearing: (value: number) => void;
}

export const useMapScaleStore = create<MapScaleState>()((set) => ({
  metersPerPx: null,
  bearing: 0,
  setMetersPerPx: (metersPerPx) => set({ metersPerPx }),
  setBearing: (bearing) => set({ bearing }),
}));
