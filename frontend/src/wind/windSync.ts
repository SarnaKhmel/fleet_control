import { useLocationStore, type LatLng } from '../location/locationStore';
import { DEFAULT_CENTER } from '../map/mapStyles';
import { fetchWindAt } from './windApi';
import type { Wind } from '../../../shared/flight/wind';
import { useWindStore } from './windStore';

// Clicks and typing can change the location several times in a row; wait for it to settle.
export const WIND_DEBOUNCE_MS = 500;

// Same place (rounded to ~1 km) reuses the last reading for a few minutes.
export const WIND_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { wind: Wind; at: number }>();

function cacheKey(point: LatLng): string {
  return `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
}

export function clearWindCache(): void {
  cache.clear();
}

let latestRequest = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/** Loads the wind at a point. Only the latest request updates the store. */
export async function syncWindAt(point: LatLng): Promise<void> {
  const id = ++latestRequest;
  const key = cacheKey(point);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < WIND_CACHE_TTL_MS) {
    useWindStore.getState().setWind(cached.wind);
    return;
  }
  useWindStore.getState().setStatus('loading');
  try {
    const wind = await fetchWindAt(point);
    cache.set(key, { wind, at: Date.now() });
    if (id === latestRequest) useWindStore.getState().setWind(wind);
  } catch {
    if (id === latestRequest) useWindStore.getState().setStatus('error');
  }
}

/** Requests the wind for the last point once no other location change arrives within the debounce window. */
export function scheduleWindAt(point: LatLng): void {
  clearTimeout(debounceTimer);
  useWindStore.getState().setStatus('loading');
  debounceTimer = setTimeout(() => void syncWindAt(point), WIND_DEBOUNCE_MS);
}

/** Wind follows the selected location; before any selection it follows the map center. Idempotent. */
export function startWindSync(): void {
  if (started) return;
  started = true;
  useLocationStore.subscribe((state, previous) => {
    if (state.selected && state.selected !== previous.selected) {
      scheduleWindAt(state.selected);
    }
  });
  void syncWindAt(DEFAULT_CENTER);
}
