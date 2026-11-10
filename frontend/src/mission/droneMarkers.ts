import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import i18n from 'i18next';
import { takesCommands } from '../../../shared/protocol';
import { DRONE_SIDC, natoElement } from '../symbology/nato';
import { batteryLevel } from './battery';
import type { DroneView } from './missionStore';
import type { SymbolStyle } from './symbolStyle';
import { useSelectionStore } from './selection';

/**
 * Classes that color a drone by its state: a drone that is out (lost link, destroyed) shows only that;
 * otherwise a low battery is yellow and a critical one red, and a building ahead makes it pulse red.
 */
function stateClasses(drone: DroneView): string[] {
  if (!takesCommands(drone.status)) return [`is-${drone.status}`];
  const level = batteryLevel(drone.batteryPct);
  return [...(level === 'ok' ? [] : [`is-battery-${level}`]), ...(drone.warning ? ['is-warning'] : [])];
}

const AIRBORNE: readonly string[] = ['idle', 'moving', 'engaging'];

const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Where the drone moves over the ground: its nose turned back by the crab angle (the nose points into the wind). */
export function courseDeg(drone: DroneView): number {
  return mod360((drone.heading ?? 0) - drone.crabDeg);
}

/** Height above the ground and ground speed, as shown beside a selected drone. */
export function readoutText(drone: DroneView): string {
  const agl = drone.altitudeM !== null && drone.groundM !== null ? drone.altitudeM - drone.groundM : drone.altitudeAglM;
  return i18n.t('drone.readout', { altitude: Math.round(agl), speed: drone.speedMs.toFixed(1) });
}

/**
 * Two arrows from the drone: the course it moves along (direction of travel), and the nose, which the wind
 * turns away from the course by the crab angle: it points into the wind.
 */
function addVectors(el: HTMLElement) {
  el.insertAdjacentHTML('beforeend', '<span class="drone-vector is-course"></span><span class="drone-vector is-nose"></span>');
}

/** Turns the arrows and refreshes the readout: the part of the marker that changes on every position update. */
function updateLive(el: HTMLElement, drone: DroneView) {
  const turn = (selector: string, deg: number) => {
    const arrow = el.querySelector<HTMLElement>(selector);
    if (arrow) arrow.style.transform = `rotate(${deg}deg)`;
  };
  turn('.drone-vector.is-course', courseDeg(drone));
  turn('.drone-vector.is-nose', mod360(drone.heading ?? 0));
  const readout = el.querySelector<HTMLElement>('.drone-readout');
  const text = readout && readoutText(drone);
  if (readout && readout.textContent !== text) readout.textContent = text;
}

// Drones that have a position: NATO symbol, or our own marker with status color. Both carry the two arrows;
// a selected drone also shows its height and speed.
export function droneElement(drone: DroneView, style: SymbolStyle, selected = false): HTMLElement {
  let el: HTMLElement;
  if (style === 'nato') {
    // 15 % smaller than the first size (30).
    el = natoElement(DRONE_SIDC, 25.5);
    el.setAttribute('aria-label', drone.callsign);
    el.classList.add(...stateClasses(drone));
    if (selected) el.classList.add('is-selected');
  } else {
    el = document.createElement('div');
    el.className = ['drone-marker', `is-${drone.status}`, ...stateClasses(drone), ...(selected ? ['is-selected'] : [])].join(' ');
    el.setAttribute('aria-label', drone.callsign);
    el.innerHTML = `<span class="drone-marker-label">${drone.callsign}</span>`;
  }
  // On the ground, landing or down, the drone is not moving: no arrows.
  if (AIRBORNE.includes(drone.status)) addVectors(el);
  if (selected && takesCommands(drone.status)) el.insertAdjacentHTML('beforeend', '<span class="drone-readout"></span>');
  updateLive(el, drone);
  return el;
}

interface MarkerEntry {
  map: MapLibreMap;
  marker: MapLibreMarkerType;
  el: HTMLElement;
  signature: string;
}

// Markers are kept per drone and reused: a position tick only moves the marker, and the element is
// rebuilt only when the status, battery level, selection, language or symbol style changes (building SVG each second is costly).
const entries = new Map<string, MarkerEntry>();

/** Keeps one marker per drone that has a position; returns the markers in use. */
export function syncDroneMarkers(map: MapLibreMap, drones: Record<string, DroneView>, style: SymbolStyle): MapLibreMarkerType[] {
  const selected = useSelectionStore.getState().selectedIds;
  const seen = new Set<string>();
  const markers: MapLibreMarkerType[] = [];

  for (const [id, drone] of Object.entries(drones)) {
    if (!drone.position) continue;
    seen.add(id);
    const isSelected = selected.includes(id);
    const signature = `${style}|${drone.status}|${stateClasses(drone).join()}|${isSelected}|${i18n.language}`;
    const lngLat: [number, number] = [drone.position.lng, drone.position.lat];
    const entry = entries.get(id);

    if (entry && entry.map === map && entry.signature === signature) {
      entry.marker.setLngLat(lngLat);
      updateLive(entry.el, drone);
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
