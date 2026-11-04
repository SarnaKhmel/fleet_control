import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import type { LatLng } from '../../../shared/protocol';

/**
 * Replaces markers with one per point. Start points are round and numbered 1, 2, 3; control points
 * of a route are square and labelled K1, K2, … so the two kinds are never confused.
 */
export function syncStartMarkers(
  map: MapLibreMap,
  previous: MapLibreMarkerType[],
  points: LatLng[],
  kind: 'start' | 'control' = 'start',
): MapLibreMarkerType[] {
  previous.forEach((marker) => marker.remove());
  return points.map((point, index) => {
    const el = document.createElement('div');
    el.className = kind === 'control' ? 'mission-control-marker' : 'mission-start-marker';
    el.textContent = kind === 'control' ? `K${index + 1}` : String(index + 1);
    el.setAttribute('aria-label', kind === 'control' ? `Control point ${index + 1}` : `Start point ${index + 1}`);
    return new Marker({ element: el, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(map);
  });
}
