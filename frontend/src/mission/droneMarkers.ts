import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { DRONE_SIDC, natoElement } from '../symbology/nato';
import type { DroneView } from './missionStore';
import type { SymbolStyle } from './symbolStyle';

// Drones that have a position: NATO symbol, or our own marker with a heading arrow and status color.
export function droneElement(drone: DroneView, style: SymbolStyle): HTMLElement {
  if (style === 'nato') {
    const el = natoElement(DRONE_SIDC, 30);
    el.setAttribute('aria-label', drone.callsign);
    return el;
  }
  const el = document.createElement('div');
  el.className = `drone-marker is-${drone.status}`;
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
  return Object.values(drones)
    .filter((drone): drone is DroneView & { position: { lat: number; lng: number } } => drone.position !== null)
    .map((drone) =>
      new Marker({ element: droneElement(drone, style), anchor: 'center' })
        .setLngLat([drone.position.lng, drone.position.lat])
        .addTo(map),
    );
}
