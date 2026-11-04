import { useLocationStore, type LatLng } from '../location/locationStore';
import { DEFAULT_CENTER } from '../map/mapStyles';
import { fetchWindAt } from './windApi';
import { useWindStore } from './windStore';

// Clicks and typing can change the location several times in a row; wait for it to settle.
export const WIND_DEBOUNCE_MS = 500;

let latestRequest = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/** Loads the wind at a point. Only the latest request updates the store. */
export async function syncWindAt(point: LatLng): Promise<void> {
  const id = ++latestRequest;
  useWindStore.getState().setStatus('loading');
  try {
    const wind = await fetchWindAt(point);
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
