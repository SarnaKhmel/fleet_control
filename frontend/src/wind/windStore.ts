import { create } from 'zustand';
import type { Wind } from '../../../shared/flight/wind';

export type WindStatus = 'loading' | 'ready' | 'error';

interface WindState {
  wind: Wind;
  temperatureC: number | null;
  humidityPct: number | null;
  status: WindStatus;
  setWeather: (weather: { wind: Wind; temperatureC: number | null; humidityPct: number | null }) => void;
  setStatus: (status: WindStatus) => void;
}

// Calm until the first reading arrives for the current location.
export const useWindStore = create<WindState>()((set) => ({
  wind: { speedMs: 0, fromDeg: 0 },
  temperatureC: null,
  humidityPct: null,
  status: 'loading',
  setWeather: ({ wind, temperatureC, humidityPct }) => set({ wind, temperatureC, humidityPct, status: 'ready' }),
  setStatus: (status) => set({ status }),
}));
