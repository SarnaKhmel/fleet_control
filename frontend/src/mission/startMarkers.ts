import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import type { LatLng } from '../../../shared/protocol';

/** Replaces markers with one per start (takeoff) point: squares numbered 1, 2, 3. */
export function syncStartMarkers(map: MapLibreMap, previous: MapLibreMarkerType[], points: LatLng[]): MapLibreMarkerType[] {
  previous.forEach((marker) => marker.remove());
  return points.map((point, index) => {
    const el = document.createElement('div');
    el.className = 'mission-start-marker';
    el.textContent = String(index + 1);
    el.setAttribute('aria-label', `Start point ${index + 1}`);
    return new Marker({ element: el, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(map);
  });
}
