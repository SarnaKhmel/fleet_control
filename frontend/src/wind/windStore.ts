import { create } from 'zustand';
import type { Wind } from '../../../shared/flight/wind';

export type WindStatus = 'loading' | 'ready' | 'error';

interface WindState {
  wind: Wind;
  status: WindStatus;
  setWind: (wind: Wind) => void;
  setStatus: (status: WindStatus) => void;
}

// Calm until the first reading arrives for the current location.
export const useWindStore = create<WindState>()((set) => ({
  wind: { speedMs: 0, fromDeg: 0 },
  status: 'loading',
  setWind: (wind) => set({ wind, status: 'ready' }),
  setStatus: (status) => set({ status }),
}));
