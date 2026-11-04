import { useLocationStore, type LatLng } from '../location/locationStore';
import { DEFAULT_CENTER } from '../map/mapStyles';
import { fetchWindAt } from './windApi';
import { useWindStore } from './windStore';

let latestRequest = 0;

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

// Wind follows the selected location; before any selection it follows the map center.
useLocationStore.subscribe((state, previous) => {
  if (state.selected && state.selected !== previous.selected) {
    void syncWindAt(state.selected);
  }
});
void syncWindAt(DEFAULT_CENTER);
