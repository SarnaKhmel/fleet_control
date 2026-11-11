import type { Map as MapLibreMap } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import type { LatLng } from '../../../shared/protocol';

// The flash and ring on the map where a drone's strike hurt a unit (CSS animation `hit-burst`). It is a
// short-lived marker, removed once the animation is over.

/** How long the effect stays on the map, ms (the animation lasts 0.9 s). */
export const HIT_EFFECT_MS = 1000;

export function playHitEffect(map: MapLibreMap, position: LatLng, outcome: 'destroyed' | 'damaged'): void {
  const el = document.createElement('div');
  el.className = `hit-effect is-${outcome}`;
  const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([position.lng, position.lat]).addTo(map);
  setTimeout(() => marker.remove(), HIT_EFFECT_MS);
}
