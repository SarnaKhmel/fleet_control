import { useLocationStore, type LatLng } from '../location/locationStore';
import { DEFAULT_CENTER } from '../map/mapStyles';
import { fetchWeatherAt, type Weather } from './windApi';
import { useWindStore } from './windStore';

// Clicks and typing can change the location several times in a row; wait for it to settle.
export const WIND_DEBOUNCE_MS = 500;

// Same place (rounded to ~1 km) reuses the last reading for a few minutes.
export const WIND_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { weather: Weather; at: number }>();

function cacheKey(point: LatLng): string {
  return `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
}

export function clearWindCache(): void {
  cache.clear();
}

let latestRequest = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/** Loads the weather at a point. Only the latest request updates the store. */
export async function syncWindAt(point: LatLng): Promise<void> {
  const id = ++latestRequest;
  const key = cacheKey(point);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < WIND_CACHE_TTL_MS) {
    useWindStore.getState().setWeather(cached.weather);
    return;
  }
  useWindStore.getState().setStatus('loading');
  try {
    const weather = await fetchWeatherAt(point);
    cache.set(key, { weather, at: Date.now() });
    if (id === latestRequest) useWindStore.getState().setWeather(weather);
  } catch {
    if (id === latestRequest) useWindStore.getState().setStatus('error');
  }
}

/** Requests the weather for the last point once no other location change arrives within the debounce window. */
export function scheduleWindAt(point: LatLng): void {
  clearTimeout(debounceTimer);
  useWindStore.getState().setStatus('loading');
  debounceTimer = setTimeout(() => void syncWindAt(point), WIND_DEBOUNCE_MS);
}

/** Weather follows the selected location; before any selection it follows the map center. Idempotent. */
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
