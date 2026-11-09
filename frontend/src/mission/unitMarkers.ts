import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import i18n from 'i18next';
import type { MissionUnit } from '../../../shared/mission/units';
import { natoElement, unitSidc } from '../symbology/nato';
import { useTargetPickStore } from './targetPickStore';

// Enemy and allied units the dashboard knows about, as NATO symbols: hostile (red diamond) for the enemy,
// friendly (blue rectangle) for allies. A unit on the move carries the NATO direction-of-movement arrow.
// An enemy out of sight stays where it was last seen.

// 15 % smaller than the first size (26).
const SIZE = 22;
// The arrow is redrawn only when the course turns by this much (each redraw rebuilds the SVG).
const HEADING_STEP_DEG = 5;

interface Entry {
  map: MapLibreMap;
  marker: MapLibreMarkerType;
  signature: string;
}

const entries = new Map<string, Entry>();

/** Course of a unit on the move, rounded to HEADING_STEP_DEG; null when it stands. */
function shownHeading(unit: MissionUnit): number | null {
  if (unit.speedMs <= 0 || unit.headingDeg === null) return null;
  return (Math.round(unit.headingDeg / HEADING_STEP_DEG) * HEADING_STEP_DEG) % 360;
}

/** What the unit is and how we know about it, for the tooltip and screen readers. */
export function unitLabel(unit: MissionUnit, callsignOf: (droneId: string) => string): string {
  const what = `${i18n.t(`unit.side.${unit.side}`)}: ${i18n.t(`unit.kind.${unit.kind}`)}`;
  const how = i18n.t(`unit.source.${unit.source}`, { callsign: unit.detectedByDroneId ? callsignOf(unit.detectedByDroneId) : '' });
  const heading = shownHeading(unit);
  const moving = heading === null ? '' : ` · ${i18n.t('unit.moving', { speed: Math.round(unit.speedMs * 3.6), heading })}`;
  const damage = unit.damaged ? ` · ${i18n.t('unit.damaged')}` : '';
  const seen = unit.inSight ? '' : ` · ${i18n.t('unit.lastSeen')}`;
  return `${what} · ${how}${moving}${damage}${seen}`;
}

export function unitElement(unit: MissionUnit, label: string): HTMLElement {
  const el = natoElement(unitSidc(unit.side, unit.kind), SIZE, shownHeading(unit) ?? undefined);
  el.classList.add('unit-marker', `is-${unit.side}`, ...(unit.inSight ? [] : ['is-last-seen']), ...(unit.damaged ? ['is-damaged'] : []));
  el.setAttribute('aria-label', label);
  el.title = label;
  // A click on an enemy opens the pop-up to strike or pursue it (see TargetPopup).
  if (unit.side === 'enemy') {
    el.addEventListener('click', (event) => useTargetPickStore.getState().open(unit.id, event.clientX, event.clientY));
  }
  return el;
}

/** Keeps one marker per known unit; returns the markers in use. */
export function syncUnitMarkers(map: MapLibreMap, units: Record<string, MissionUnit>, callsignOf: (droneId: string) => string): MapLibreMarkerType[] {
  const markers: MapLibreMarkerType[] = [];
  for (const [id, unit] of Object.entries(units)) {
    // The signature is built from the raw fields: the translated label is made only when the marker is rebuilt.
    const callsign = unit.detectedByDroneId ? callsignOf(unit.detectedByDroneId) : '';
    const signature = [unit.side, unit.kind, shownHeading(unit), Math.round(unit.speedMs * 3.6), unit.inSight, unit.damaged ?? false, unit.source, callsign, i18n.language].join('|');
    const lngLat: [number, number] = [unit.position.lng, unit.position.lat];
    const entry = entries.get(id);
    if (entry && entry.map === map && entry.signature === signature) {
      entry.marker.setLngLat(lngLat);
      markers.push(entry.marker);
      continue;
    }
    entry?.marker.remove();
    const label = unitLabel(unit, callsignOf);
    const marker = new Marker({ element: unitElement(unit, label), anchor: 'center' }).setLngLat(lngLat).addTo(map);
    entries.set(id, { map, marker, signature });
    markers.push(marker);
  }
  for (const [id, entry] of entries) {
    if (!(id in units)) {
      entry.marker.remove();
      entries.delete(id);
    }
  }
  return markers;
}
