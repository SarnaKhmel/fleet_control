import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { DRONE_SIDC, natoElement } from '../symbology/nato';
import type { DroneView } from './missionStore';
import type { SymbolStyle } from './symbolStyle';
import { useSelectionStore } from './selection';

// Drones that have a position: NATO symbol, or our own marker with a heading arrow and status color.
export function droneElement(drone: DroneView, style: SymbolStyle, selected = false): HTMLElement {
  if (style === 'nato') {
    const el = natoElement(DRONE_SIDC, 30);
    el.setAttribute('aria-label', drone.callsign);
    if (selected) el.classList.add('is-selected');
    return el;
  }
  const el = document.createElement('div');
  el.className = `drone-marker is-${drone.status}${selected ? ' is-selected' : ''}`;
  el.setAttribute('aria-label', drone.callsign);
  el.innerHTML = `<span class="drone-marker-arrow" style="transform: rotate(${drone.heading ?? 0}deg)"></span><span class="drone-marker-label">${drone.callsign}</span>`;
  return el;
}

/** Replaces all drone markers with the current drones. Returns the new list. */
export function syncDroneMarkers(
  map: MapLibreMap,
  previous: MapLibreMarkerType[],
  drones: Record<string, DroneView>,
  style: SymbolStyle,
): MapLibreMarkerType[] {
  previous.forEach((marker) => marker.remove());
  const selected = useSelectionStore.getState().selectedIds;
  return Object.entries(drones)
    .filter((entry): entry is [string, DroneView & { position: { lat: number; lng: number } }] => entry[1].position !== null)
    .map(([id, drone]) => {
      const el = droneElement(drone, style, selected.includes(id));
      // Shift+click toggles the drone in the selection; a plain click selects only that drone.
      el.addEventListener('click', (event) => {
        if (event.shiftKey) useSelectionStore.getState().toggle(id);
        else useSelectionStore.getState().select([id]);
      });
      return new Marker({ element: el, anchor: 'center' }).setLngLat([drone.position.lng, drone.position.lat]).addTo(map);
    });
}
