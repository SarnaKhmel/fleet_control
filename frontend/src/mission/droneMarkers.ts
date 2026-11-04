import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import { DRONE_SIDC, natoElement } from '../symbology/nato';
import { batteryLevel } from './battery';
import type { DroneView } from './missionStore';
import type { SymbolStyle } from './symbolStyle';
import { useSelectionStore } from './selection';

/**
 * Classes that color a drone by its state: a drone that lost its link is grey; otherwise a low battery
 * is yellow and a critical one red.
 */
function stateClasses(drone: DroneView): string[] {
  if (drone.status === 'lost_link') return ['is-lost_link'];
  const level = batteryLevel(drone.batteryPct);
  return level === 'ok' ? [] : [`is-battery-${level}`];
}

// Drones that have a position: NATO symbol, or our own marker with a heading arrow and status color.
export function droneElement(drone: DroneView, style: SymbolStyle, selected = false): HTMLElement {
  if (style === 'nato') {
    const el = natoElement(DRONE_SIDC, 30);
    el.setAttribute('aria-label', drone.callsign);
    el.classList.add(...stateClasses(drone));
    if (selected) el.classList.add('is-selected');
    return el;
  }
  const el = document.createElement('div');
  el.className = ['drone-marker', `is-${drone.status}`, ...stateClasses(drone), ...(selected ? ['is-selected'] : [])].join(' ');
  el.setAttribute('aria-label', drone.callsign);
  el.innerHTML = `<span class="drone-marker-arrow" style="transform: rotate(${drone.heading ?? 0}deg)"></span><span class="drone-marker-label">${drone.callsign}</span>`;
  return el;
}

interface MarkerEntry {
  map: MapLibreMap;
  marker: MapLibreMarkerType;
  el: HTMLElement;
  signature: string;
}

// Markers are kept per drone and reused: a position tick only moves the marker, and the element is
// rebuilt only when the status, battery level, selection or symbol style changes (building SVG each second is costly).
const entries = new Map<string, MarkerEntry>();

function setArrowRotation(el: HTMLElement, heading: number | null) {
  const arrow = el.querySelector<HTMLElement>('.drone-marker-arrow');
  if (arrow) arrow.style.transform = `rotate(${heading ?? 0}deg)`;
}

/** Keeps one marker per drone that has a position; returns the markers in use. */
export function syncDroneMarkers(map: MapLibreMap, drones: Record<string, DroneView>, style: SymbolStyle): MapLibreMarkerType[] {
  const selected = useSelectionStore.getState().selectedIds;
  const seen = new Set<string>();
  const markers: MapLibreMarkerType[] = [];

  for (const [id, drone] of Object.entries(drones)) {
    if (!drone.position) continue;
    seen.add(id);
    const isSelected = selected.includes(id);
    const signature = `${style}|${drone.status}|${stateClasses(drone).join()}|${isSelected}`;
    const lngLat: [number, number] = [drone.position.lng, drone.position.lat];
    const entry = entries.get(id);

    if (entry && entry.map === map && entry.signature === signature) {
      entry.marker.setLngLat(lngLat);
      if (style === 'custom') setArrowRotation(entry.el, drone.heading);
      markers.push(entry.marker);
      continue;
    }

    entry?.marker.remove();
    const el = droneElement(drone, style, isSelected);
    // Shift+click toggles the drone in the selection; a plain click selects only that drone.
    el.addEventListener('click', (event) => {
      if (event.shiftKey) useSelectionStore.getState().toggle(id);
      else useSelectionStore.getState().select([id]);
    });
    const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
    entries.set(id, { map, marker, el, signature });
    markers.push(marker);
  }

  for (const [id, entry] of entries) {
    if (!seen.has(id)) {
      entry.marker.remove();
      entries.delete(id);
    }
  }
  return markers;
}
