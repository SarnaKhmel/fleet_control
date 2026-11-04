import { create } from 'zustand';

interface MapScaleState {
  metersPerPx: number | null;
  setMetersPerPx: (value: number) => void;
}

export const useMapScaleStore = create<MapScaleState>()((set) => ({
  metersPerPx: null,
  setMetersPerPx: (metersPerPx) => set({ metersPerPx }),
}));
