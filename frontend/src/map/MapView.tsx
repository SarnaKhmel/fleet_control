import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapWorker';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyleFor, useMapViewStore } from './mapStyles';
import { addBuildingsLayer, BUILDINGS_LAYER_ID, BUILDING_COLORS, TILT_3D_PITCH } from './buildings';
import { addTerrain, groundElevationAt } from './terrain';
import { CONTROL_POINT_SIDC, natoElement } from '../symbology/nato';

function applyBuildingVisibility(map: MapLibreMap, on: boolean) {
  if (map.getLayer(BUILDINGS_LAYER_ID)) {
    map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', on ? 'visible' : 'none');
  }
}

export function MapView() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const styleRef = useRef<string | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const view = useMapViewStore((state) => state.view);
  const buildings3d = useMapViewStore((state) => state.buildings3d);
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
    // Style changes (theme, map view) drop custom layers, so re-add them on every style load.
    map.on('style.load', () => {
      const current = useThemeStore.getState().theme;
      addTerrain(map);
      addBuildingsLayer(map, current);
      map.setPitch(useMapViewStore.getState().buildings3d ? TILT_3D_PITCH : 0);
      applyBuildingVisibility(map, useMapViewStore.getState().buildings3d);
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
    const map = mapRef.current;
    if (!map || styleRef.current === style) return;
    map.setStyle(style);
    styleRef.current = style;
  }, [theme, view]);

  // Recolor buildings with the theme; 3D on/off = tilt + layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(BUILDINGS_LAYER_ID)) return;
    map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-color', BUILDING_COLORS[theme]);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyBuildingVisibility(map, buildings3d);
    map.setPitch(buildings3d ? TILT_3D_PITCH : 0);
  }, [buildings3d]);

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
    // Terrain tiles load asynchronously: read the elevation now and again once the map is idle.
    const readGround = () => useLocationStore.getState().setGround(groundElevationAt(map, selected));
    readGround();
    map.once('idle', readGround);

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
