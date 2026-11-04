import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapWorker';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyleFor, useMapViewStore } from './mapStyles';
import { addBuildingsLayer, BUILDINGS_LAYER_ID, BUILDING_COLORS, TILT_3D_PITCH } from './buildings';
import { addTerrain, groundElevationAt, TERRAIN_SOURCE_ID } from './terrain';
import { addBordersLayer, BORDERS_LAYER_ID, BORDER_COLORS } from './borders';
import { useMapScaleStore } from './mapScaleStore';
import { metersPerPixel } from './scale';
import { useMapIssueStore } from './mapIssue';
import { syncFrontLine } from '../frontline/frontLine';
import { syncMissionArea } from '../mission/missionLayer';
import { effectiveCenter, useMissionStore } from '../mission/missionStore';
import { syncStartMarkers } from '../mission/startMarkers';
import { syncDroneMarkers } from '../mission/droneMarkers';
import { boxesOverlap, boxOf, registerZoneFitter, zoneBoxOf } from '../mission/zoneView';
import { areaRing } from '../../../shared/mission/area';
import { useSymbolStyleStore } from '../mission/symbolStyle';
import { useFrontLineStore } from '../frontline/frontLine';
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
  const startMarkersRef = useRef<Marker[]>([]);
  const missionPoints = useMissionStore((state) => state.points);
  const drones = useMissionStore((state) => state.drones);
  const symbolStyle = useSymbolStyleStore((state) => state.style);
  const droneMarkersRef = useRef<Marker[]>([]);
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
      useMapIssueStore.getState().setIssue(null);
      const current = useThemeStore.getState().theme;
      addTerrain(map);
      addBuildingsLayer(map, current);
      addBordersLayer(map, current);
      syncMissionArea(map, useMissionStore.getState(), current);
      const front = useFrontLineStore.getState();
      syncFrontLine(map, { enabled: front.enabled, zones: front.zones, theme: current });
      map.setPitch(useMapViewStore.getState().buildings3d ? TILT_3D_PITCH : 0);
      applyBuildingVisibility(map, useMapViewStore.getState().buildings3d);
    });
    // Scale bar follows the map center's latitude and zoom.
    const updateScale = () => useMapScaleStore.getState().setMetersPerPx(metersPerPixel(map.getCenter().lat, map.getZoom()));
    updateScale();
    map.on('move', updateScale);

    // Elevation is re-read after every idle, so it follows the map once tiles arrive.
    map.on('idle', () => {
      const point = useLocationStore.getState().selected;
      if (point) useLocationStore.getState().setGround(groundElevationAt(map, point));
    });
    map.on('error', (event) => {
      // MapLibre reports the failing source; errors without one come from the style itself.
      const sourceId = (event as { sourceId?: string }).sourceId;
      if (sourceId === TERRAIN_SOURCE_ID) useMapIssueStore.getState().setIssue('terrain');
      else if (!sourceId) useMapIssueStore.getState().setIssue('style');
    });
    map.on('click', (event) => {
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      const mission = useMissionStore.getState();
      // Mode clicks take priority: zone drawing, then start points, else the location.
      if (mission.drawing) mission.drawClick(point);
      else if (mission.picking) mission.addPoint(point);
      else useLocationStore.getState().select(point);
    });
    // Tell the UI whether the mission zone is still on screen, and register the "back to zone" action.
    const updateZoneVisibility = () => {
      const mission = useMissionStore.getState();
      const b = map.getBounds();
      const view = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
      const zone = zoneBoxOf(effectiveCenter(mission), mission.widthKm, mission.heightKm);
      mission.setZoneVisible(boxesOverlap(view, zone));
    };
    map.on('move', updateZoneVisibility);
    registerZoneFitter(() => {
      const mission = useMissionStore.getState();
      const z = boxOf(areaRing({ center: effectiveCenter(mission), widthKm: mission.widthKm, heightKm: mission.heightKm }));
      map.fitBounds(
        [
          [z.west, z.south],
          [z.east, z.north],
        ],
        { padding: 24, duration: 800 },
      );
    });
    map.on('mousemove', (event) => {
      const mission = useMissionStore.getState();
      if (mission.drawing && mission.drawAnchor) mission.setDrawCursor({ lat: event.lngLat.lat, lng: event.lngLat.lng });
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

  // Numbered markers for the picked start points.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    startMarkersRef.current = syncStartMarkers(map, startMarkersRef.current, missionPoints);
  }, [missionPoints]);

  // Drones with a known position, drawn as NATO symbols or in our own style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    droneMarkersRef.current = syncDroneMarkers(map, droneMarkersRef.current, drones, symbolStyle);
  }, [drones, symbolStyle]);

  // Approximate front line follows its switch, the loaded zones and the theme.
  const frontEnabled = useFrontLineStore((state) => state.enabled);
  const frontZones = useFrontLineStore((state) => state.zones);
  const missionCenter = useMissionStore((state) => state.center);
  const missionWidth = useMissionStore((state) => state.widthKm);
  const missionHeight = useMissionStore((state) => state.heightKm);
  const drawCursor = useMissionStore((state) => state.drawCursor);
  const drawAnchor = useMissionStore((state) => state.drawAnchor);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncMissionArea(map, useMissionStore.getState(), theme);
  }, [missionCenter, missionWidth, missionHeight, drawCursor, drawAnchor, theme]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncFrontLine(map, { enabled: frontEnabled, zones: frontZones, theme });
  }, [frontEnabled, frontZones, theme]);

  // Recolor buildings with the theme; 3D on/off = tilt + layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(BUILDINGS_LAYER_ID)) return;
    map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-color', BUILDING_COLORS[theme]);
    if (map.getLayer(BORDERS_LAYER_ID)) map.setPaintProperty(BORDERS_LAYER_ID, 'line-color', BORDER_COLORS[theme]);
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
    // Read now; the idle handler keeps it current once terrain tiles arrive.
    useLocationStore.getState().setGround(groundElevationAt(map, selected));

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
