import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapWorker';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyleFor, useMapViewStore } from './mapStyles';
import { CONTROL_POINT_SIDC, natoElement } from '../symbology/nato';

export function MapView() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const styleRef = useRef<string | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const view = useMapViewStore((state) => state.view);
  const selected = useLocationStore((state) => state.selected);
  const focusTick = useLocationStore((state) => state.focusTick);

  // Create the map once; clicking it selects a location.
  useEffect(() => {
    const style = mapStyleFor(useThemeStore.getState().theme, useMapViewStore.getState().view);
    const map = new MapLibreMap({
      container: containerRef.current!,
      style,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
    });
    map.on('click', (event) => {
      useLocationStore.getState().select({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    mapRef.current = map;
    styleRef.current = style;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Switch the basemap when the theme or the map view changes; skip if the style is already loaded.
  useEffect(() => {
    const style = mapStyleFor(theme, view);
    if (!mapRef.current || styleRef.current === style) return;
    mapRef.current.setStyle(style);
    styleRef.current = style;
  }, [theme, view]);

  // Fly to a location chosen from the header or the saved list (not on plain map clicks).
  useEffect(() => {
    const point = useLocationStore.getState().selected;
    if (!focusTick || !point || !mapRef.current) return;
    mapRef.current.flyTo({ center: [point.lng, point.lat], zoom: Math.max(mapRef.current.getZoom(), 12) });
  }, [focusTick]);

  // Show the marker for the selected location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selected) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [selected.lng, selected.lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      markerRef.current = new Marker({ element: natoElement(CONTROL_POINT_SIDC, 28), anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [selected]);

  return <div ref={containerRef} className="map" role="region" aria-label={t('map.label')} />;
}
