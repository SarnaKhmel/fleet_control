import { create } from 'zustand';
import type { Wind } from '../../../shared/flight/wind';

interface WindState {
  wind: Wind;
  setWind: (wind: Wind) => void;
}

// Calm until the server sends the estimated wind (telemetry environment group).
export const useWindStore = create<WindState>()((set) => ({
  wind: { speedMs: 0, fromDeg: 0 },
  setWind: (wind) => set({ wind }),
}));
