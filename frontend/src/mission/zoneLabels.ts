import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import i18n from 'i18next';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area';
import type { LatLng } from '../../../shared/protocol';

// Width and height of the mission zone, written on its edges while it is drawn and while it is shown.
// They are DOM markers, like the other markers, so they read the same on every basemap.

export interface ZoneSize {
  widthKm: number;
  heightKm: number;
  /** Where the width label sits: the middle of the top edge. */
  top: LatLng;
  /** Where the height label sits: the middle of the right edge. */
  right: LatLng;
}

/** Width, height and label points of a zone rectangle (its corners, as drawn). */
export function zoneSize(ring: LatLng[]): ZoneSize {
  const center = { lat: ring.reduce((sum, p) => sum + p.lat, 0) / ring.length, lng: ring.reduce((sum, p) => sum + p.lng, 0) / ring.length };
  const meters = ring.map((p) => toMetersFrom(center, p));
  const [minE, maxE] = [Math.min(...meters.map((m) => m.east)), Math.max(...meters.map((m) => m.east))];
  const [minN, maxN] = [Math.min(...meters.map((m) => m.north)), Math.max(...meters.map((m) => m.north))];
  return {
    widthKm: (maxE - minE) / 1000,
    heightKm: (maxN - minN) / 1000,
    top: offsetLatLng(center, (minE + maxE) / 2, maxN),
    right: offsetLatLng(center, maxE, (minN + maxN) / 2),
  };
}

interface Labels {
  map: MapLibreMap;
  width: MapLibreMarkerType;
  height: MapLibreMarkerType;
  widthEl: HTMLElement;
  heightEl: HTMLElement;
}

let labels: Labels | null = null;

function labelElement(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'zone-label';
  el.textContent = text;
  return el;
}

/** Puts the width and height labels on the zone's edges (created on first use, moved after that). */
export function syncZoneLabels(map: MapLibreMap, ring: LatLng[]): void {
  const size = zoneSize(ring);
  const widthText = `${i18n.t('mission.width')} ${size.widthKm.toFixed(1)} km`;
  const heightText = `${i18n.t('mission.height')} ${size.heightKm.toFixed(1)} km`;
  if (!labels || labels.map !== map) {
    removeZoneLabels();
    const widthEl = labelElement(widthText);
    const heightEl = labelElement(heightText);
    labels = {
      map,
      width: new Marker({ element: widthEl, anchor: 'bottom' }).setLngLat([size.top.lng, size.top.lat]).addTo(map),
      height: new Marker({ element: heightEl, anchor: 'left' }).setLngLat([size.right.lng, size.right.lat]).addTo(map),
      widthEl,
      heightEl,
    };
    return;
  }
  labels.widthEl.textContent = widthText;
  labels.heightEl.textContent = heightText;
  labels.width.setLngLat([size.top.lng, size.top.lat]);
  labels.height.setLngLat([size.right.lng, size.right.lat]);
}

/** Takes the labels off the map. */
export function removeZoneLabels(): void {
  labels?.width.remove();
  labels?.height.remove();
  labels = null;
}
