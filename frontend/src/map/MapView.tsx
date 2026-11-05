import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapWorker';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyleFor, mapStyleKey, useMapViewStore } from './mapStyles';
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
import { addWaypointLayer, syncWaypoints } from '../mission/waypointLayer';
import { addCameraLayer, syncCamera } from '../mission/cameraLayer';
import { addRangeLayer, syncRange } from '../mission/rangeLayer';
import { addReconLayer, syncRecon } from '../mission/reconLayer';
import { useWindStore } from '../wind/windStore';
import { syncTaskMarkers } from '../mission/taskMarkers';
import { syncUnitMarkers } from '../mission/unitMarkers';
import { headOnlineDronesToward, moveOnlineDrones } from '../mission/missionSocket';
import { dronesInScreenBox, useSelectionStore, type ScreenPoint } from '../mission/selection';
import { boxesOverlap, boxOf, registerZoneFitter, zoneBoxOf } from '../mission/zoneView';
import { registerNorthUp, registerViewReset } from './viewReset';
import { fitMissionZone } from '../mission/zoneView';
import { areaRing } from '../../../shared/mission/area';
import { useSymbolStyleStore } from '../mission/symbolStyle';
import { useFrontLineStore } from '../frontline/frontLine';
import { locationPinElement } from './locationPin';
import { debugLog } from '../log';

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
  const styleRef = useRef<string | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const view = useMapViewStore((state) => state.view);
  const buildings3d = useMapViewStore((state) => state.buildings3d);
  const selected = useLocationStore((state) => state.selected);
  const focusTick = useLocationStore((state) => state.focusTick);

  // Create the map once; clicking it selects a location.
  useEffect(() => {
    const { theme: startTheme } = useThemeStore.getState();
    const { view: startView } = useMapViewStore.getState();
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: mapStyleFor(startTheme, startView),
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
      const { drones } = useMissionStore.getState();
      const { selectedIds } = useSelectionStore.getState();
      const { reconGrid, reconCells } = useMissionStore.getState();
      addReconLayer(map, current);
      syncRecon(map, reconGrid, reconCells, current);
      addCameraLayer(map, current);
      syncCamera(map, drones, selectedIds, current);
      addRangeLayer(map, current);
      syncRange(map, drones, selectedIds, useWindStore.getState().wind, current);
      addWaypointLayer(map, current);
      syncWaypoints(map, drones, selectedIds, current);
      const front = useFrontLineStore.getState();
      syncFrontLine(map, { enabled: front.enabled, zones: front.zones, theme: current });
      map.setPitch(useMapViewStore.getState().buildings3d ? TILT_3D_PITCH : 0);
      applyBuildingVisibility(map, useMapViewStore.getState().buildings3d);
    });
    // Scale bar follows the map center's latitude and zoom.
    const updateScale = () => useMapScaleStore.getState().setMetersPerPx(metersPerPixel(map.getCenter().lat, map.getZoom()));
    updateScale();
    map.on('move', updateScale);
    // The compass follows the map's bearing; it changes only while the map is being rotated.
    map.on('rotate', () => useMapScaleStore.getState().setBearing(map.getBearing()));
    registerNorthUp(() => map.easeTo({ bearing: 0, duration: 500 }));

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
    // Shift+drag selects drones in a box, so MapLibre's own Shift+drag zoom is turned off.
    map.boxZoom.disable();
    let boxStart: ScreenPoint | null = null;
    let boxEl: HTMLDivElement | null = null;
    let suppressNextClick = false;
    const drawBox = (end: ScreenPoint) => {
      if (!boxStart || !boxEl) return;
      boxEl.style.left = `${Math.min(boxStart.x, end.x)}px`;
      boxEl.style.top = `${Math.min(boxStart.y, end.y)}px`;
      boxEl.style.width = `${Math.abs(end.x - boxStart.x)}px`;
      boxEl.style.height = `${Math.abs(end.y - boxStart.y)}px`;
    };
    map.on('mousedown', (event) => {
      // A fresh press starts a new gesture: a click suppressed after an earlier box must not leak into it.
      suppressNextClick = false;
      if (!event.originalEvent.shiftKey || useMissionStore.getState().drawing) return;
      boxStart = { x: event.point.x, y: event.point.y };
      boxEl = document.createElement('div');
      boxEl.className = 'selection-box';
      containerRef.current?.appendChild(boxEl);
      map.dragPan.disable();
    });
    map.on('mouseup', (event) => {
      if (!boxStart) return;
      const positions: Record<string, ScreenPoint> = {};
      for (const [id, drone] of Object.entries(useMissionStore.getState().drones)) {
        if (!drone.position) continue;
        const p = map.project([drone.position.lng, drone.position.lat]);
        positions[id] = { x: p.x, y: p.y };
      }
      useSelectionStore.getState().select(dronesInScreenBox(positions, boxStart, { x: event.point.x, y: event.point.y }));
      boxEl?.remove();
      boxStart = null;
      boxEl = null;
      map.dragPan.enable();
      suppressNextClick = true;
    });
    map.on('click', (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      // A click on a marker (drone, start or control point) bubbles up to the map too. The marker handles
      // it itself; as a map click it would send the just-selected drone to its own position.
      const target = event.originalEvent?.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      // A click adds the point to the end of the selected drones' tasks; Ctrl+click (Cmd+click on a Mac)
      // starts their tasks over with just this point.
      const append = !(event.originalEvent?.ctrlKey || event.originalEvent?.metaKey);
      const mission = useMissionStore.getState();
      debugLog('map click', {
        point,
        modes: { drawing: mission.drawing, picking: mission.picking, phase: mission.phase },
        selected: useSelectionStore.getState().selectedIds,
        shift: !!event.originalEvent?.shiftKey,
      });
      // Mode clicks take priority: zone drawing, then start points, else the location.
      if (mission.drawing) mission.drawClick(point);
      else if (mission.picking) mission.addPoint(point);
      // Shift+click with drones selected sets their course toward the clicked point.
      else if (event.originalEvent?.shiftKey && useSelectionStore.getState().selectedIds.length > 0) headOnlineDronesToward(point);
      // With drones selected, a click gives them that point as a task (Esc clears the selection).
      else if (useSelectionStore.getState().selectedIds.length > 0) moveOnlineDrones(point, append);
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
    registerViewReset(() => {
      // Back to the selected location if there is one, otherwise to the default center.
      const home = useLocationStore.getState().selected ?? DEFAULT_CENTER;
      map.easeTo({
        center: [home.lng, home.lat],
        zoom: DEFAULT_ZOOM,
        bearing: 0,
        pitch: useMapViewStore.getState().buildings3d ? TILT_3D_PITCH : 0,
        duration: 800,
      });
    });
    map.on('mousemove', (event) => {
      drawBox({ x: event.point.x, y: event.point.y });
      const mission = useMissionStore.getState();
      if (mission.drawing && mission.drawAnchor) mission.setDrawCursor({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    mapRef.current = map;
    styleRef.current = mapStyleKey(startTheme, startView);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Switch the basemap when the theme or the map view changes; skip if the style is already loaded.
  useEffect(() => {
    const key = mapStyleKey(theme, view);
    const map = mapRef.current;
    if (!map || styleRef.current === key) return;
    map.setStyle(mapStyleFor(theme, view));
    styleRef.current = key;
  }, [theme, view]);

  // Numbered markers for the picked start points.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    startMarkersRef.current = syncStartMarkers(map, startMarkersRef.current, missionPoints);
  }, [missionPoints]);

  // Drones with a known position, drawn as NATO symbols or in our own style; the selected ones also
  // show their path, their task points, what their camera sees and how far they can still fly.
  // Positions change many times a second, so the map follows the stores directly instead of
  // re-rendering this component on every update (tasks/tech.md, section 6).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = () => {
      const { drones } = useMissionStore.getState();
      const { selectedIds } = useSelectionStore.getState();
      syncDroneMarkers(map, drones, useSymbolStyleStore.getState().style);
      const theme = useThemeStore.getState().theme;
      syncCamera(map, drones, selectedIds, theme);
      syncRange(map, drones, selectedIds, useWindStore.getState().wind, theme);
      syncWaypoints(map, drones, selectedIds, theme);
      syncTaskMarkers(map, drones, selectedIds);
    };
    // Known enemy and allied units: they change only when one is found or one in sight moves.
    const syncUnits = () => {
      const { units, drones } = useMissionStore.getState();
      syncUnitMarkers(map, units, (droneId) => drones[droneId]?.callsign ?? droneId);
    };
    sync();
    syncUnits();
    const unsubscribe = [
      useMissionStore.subscribe((state, previous) => {
        if (state.drones !== previous.drones) sync();
      }),
      useMissionStore.subscribe((state, previous) => {
        if (state.units !== previous.units) syncUnits();
      }),
      useSelectionStore.subscribe((state, previous) => {
        if (state.selectedIds !== previous.selectedIds) sync();
      }),
      useSymbolStyleStore.subscribe(sync),
      useThemeStore.subscribe(sync),
      useWindStore.subscribe((state, previous) => {
        if (state.wind !== previous.wind) sync();
      }),
      // The seen ground changes about once a second while drones fly; it has its own layer and update.
      useMissionStore.subscribe((state, previous) => {
        if (state.reconCells !== previous.reconCells) syncRecon(map, state.reconGrid, state.reconCells, useThemeStore.getState().theme);
      }),
      useThemeStore.subscribe((state) => {
        const { reconGrid, reconCells } = useMissionStore.getState();
        syncRecon(map, reconGrid, reconCells, state.theme);
      }),
    ];
    return () => unsubscribe.forEach((stop) => stop());
  }, []);

  // Approximate front line follows its switch, the loaded zones and the theme.
  const frontEnabled = useFrontLineStore((state) => state.enabled);
  const frontZones = useFrontLineStore((state) => state.zones);
  const missionCenter = useMissionStore((state) => state.center);
  const missionPhase = useMissionStore((state) => state.phase);
  const missionDrawing = useMissionStore((state) => state.drawing);
  const missionChosen = useMissionStore((state) => state.zoneChosen);
  // When a mission starts, bring its zone into view so the operator sees it.
  useEffect(() => {
    if (missionPhase === 'running') fitMissionZone();
  }, [missionPhase]);
  const missionWidth = useMissionStore((state) => state.widthKm);
  const missionHeight = useMissionStore((state) => state.heightKm);
  const drawCursor = useMissionStore((state) => state.drawCursor);
  const drawAnchor = useMissionStore((state) => state.drawAnchor);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // isStyleLoaded can stay false for a moment after a source change; run once the map is idle.
    const run = () => syncMissionArea(map, useMissionStore.getState(), theme);
    if (map.isStyleLoaded()) run();
    else map.once('idle', run);
  }, [missionCenter, missionWidth, missionHeight, missionPhase, missionDrawing, missionChosen, drawCursor, drawAnchor, theme]);
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
      markerRef.current = new Marker({ element: locationPinElement(), anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [selected]);

  return <div ref={containerRef} className="map" role="region" aria-label={t('map.label')} />;
}
