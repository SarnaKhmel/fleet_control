import { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { MapView } from './MapView';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { mapInstances, markerInstances } from '../test/maplibreMock';
import { useMapViewStore } from './mapStyles';
import { useMapIssueStore } from './mapIssue';
import { useMapScaleStore } from './mapScaleStore';
import { useMissionStore } from '../mission/missionStore';
import { WAYPOINT_SOURCE_ID } from '../mission/waypointLayer';

import { useSelectionStore } from '../mission/selection';
import { moveOnlineDrones } from '../mission/missionSocket';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));
vi.mock('../mission/missionSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mission/missionSocket')>()),
  moveOnlineDrones: vi.fn(),
}));

describe('MapView', () => {
  beforeEach(() => {
    mapInstances.length = 0;
    useThemeStore.setState({ theme: 'dark' });
    useLocationStore.setState({ selected: null });
    useMapViewStore.setState({ view: 'auto' });
  });

  it('creates the map with the dark style by default', () => {
    render(<MapView />);
    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/fiord');
  });

  it('selects a location when the map is clicked', () => {
    render(<MapView />);
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.1, lng: 30.2 } });
    });
    expect(useLocationStore.getState().selected).toEqual({ lat: 50.1, lng: 30.2 });
  });

  it('ignores a map click that comes from a marker', () => {
    useMissionStore.setState({ phase: 'running', routeMode: true, routePoints: [] });
    render(<MapView />);
    const marker = document.createElement('div');
    marker.className = 'maplibregl-marker';
    const label = marker.appendChild(document.createElement('span'));
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.1, lng: 30.2 }, originalEvent: { target: label } } as never);
    });
    expect(useMissionStore.getState().routePoints).toEqual([]);
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.1, lng: 30.2 }, originalEvent: { target: document.body } } as never);
    });
    expect(useMissionStore.getState().routePoints).toEqual([{ lat: 50.1, lng: 30.2 }]);
    useMissionStore.setState({ phase: 'idle', routeMode: false, routePoints: [] });
  });

  it('with drones selected, a click replaces their tasks and Ctrl+click appends to them', () => {
    useMissionStore.setState({ phase: 'running', picking: false, drawing: false, routeMode: false, moveMode: false });
    useSelectionStore.setState({ selectedIds: ['drone-1'] });
    render(<MapView />);
    act(() => mapInstances[0].emit('click', { lngLat: { lat: 50.1, lng: 30.2 }, originalEvent: { target: document.body } } as never));
    expect(moveOnlineDrones).toHaveBeenLastCalledWith({ lat: 50.1, lng: 30.2 }, false);
    act(() => mapInstances[0].emit('click', { lngLat: { lat: 50.3, lng: 30.4 }, originalEvent: { target: document.body, ctrlKey: true } } as never));
    expect(moveOnlineDrones).toHaveBeenLastCalledWith({ lat: 50.3, lng: 30.4 }, true);
    useSelectionStore.setState({ selectedIds: [] });
    useMissionStore.setState({ phase: 'idle' });
  });

  it('adds control points after a start made with start-point picking left on', () => {
    useMissionStore.setState({ phase: 'idle', picking: true, routeMode: false, routePoints: [], drones: {} });
    useMissionStore.getState().markStarting();
    useMissionStore.getState().setRouteMode(true);
    render(<MapView />);
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.2, lng: 30.3 } });
    });
    expect(useMissionStore.getState().routePoints).toEqual([{ lat: 50.2, lng: 30.3 }]);
    useMissionStore.setState({ phase: 'idle', routeMode: false, routePoints: [] });
  });

  it('moves a drone marker on a position update without re-rendering the map component', () => {
    useMissionStore.setState({ phase: 'running', drones: {} });
    let renders = 0;
    render(
      <Profiler id="map" onRender={() => renders++}>
        <MapView />
      </Profiler>,
    );
    act(() => {
      useMissionStore.getState().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30, altitude_amsl_m: 150 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    });
    const marker = markerInstances.at(-1)!;
    expect(marker.lngLat).toEqual([30, 50]);
    const before = renders;
    act(() => {
      useMissionStore.getState().apply({ type: 'position', droneId: 'drone-1', position: { lat: 50.1, lng: 30.1 }, heading: 0, speedMs: 10, altitudeM: 210, batteryPct: 99, crabDeg: 0, origin: null, tasks: [] });
    });
    expect(marker.lngLat).toEqual([30.1, 50.1]);
    expect(renders).toBe(before);
    useMissionStore.setState({ phase: 'idle', drones: {} });
  });

  it('updates drone paths while map tiles are still loading', () => {
    useMissionStore.setState({ phase: 'running', drones: {} });
    render(<MapView />);
    const map = mapInstances[0];
    // The source exists (added on style load), but some tiles are still loading.
    const setData = vi.fn();
    map.sources[WAYPOINT_SOURCE_ID] = { setData };
    map.layers['drone-waypoints-line'] = { id: 'drone-waypoints-line' };
    map.layers['drone-waypoints-point'] = { id: 'drone-waypoints-point' };
    map.isStyleLoaded = () => false;
    act(() => {
      useMissionStore.getState().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30, altitude_amsl_m: 150 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    });
    expect(setData).toHaveBeenCalled();
    useMissionStore.setState({ phase: 'idle', drones: {} });
  });

  it('switches the basemap style when the theme changes', () => {
    render(<MapView />);
    act(() => useThemeStore.getState().setTheme('light'));
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('switches to the landscape style when the map view changes', () => {
    render(<MapView />);
    act(() => useMapViewStore.getState().setView('landscape'));
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/bright');
  });
});

describe('3D buildings', () => {
  beforeEach(() => {
    mapInstances.length = 0;
    useThemeStore.setState({ theme: 'dark' });
    useMapViewStore.setState({ view: 'auto', buildings3d: true });
  });

  it('adds the extrusion layer on style load and tilts the camera', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('style.load', {} as never));
    expect(mapInstances[0].getLayer('3d-buildings')).toBeTruthy();
    expect(mapInstances[0].pitch).toBe(50);
  });

  it('hides the layer and flattens the camera when turned off', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('style.load', {} as never));
    act(() => useMapViewStore.getState().setBuildings3d(false));
    expect(mapInstances[0].getLayer('3d-buildings')?.visibility).toBe('none');
    expect(mapInstances[0].pitch).toBe(0);
  });

  it('shows a banner when terrain fails, and clears it on the next style load', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('error', { sourceId: 'terrain-dem', error: new Error('x') } as never));
    expect(useMapIssueStore.getState().issue).toBe('terrain');
    act(() => mapInstances[0].emit('style.load', {} as never));
    expect(useMapIssueStore.getState().issue).toBeNull();
  });

  it('flags a style failure and ignores tile errors', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('error', { sourceId: 'openmaptiles', error: new Error('tile') } as never));
    expect(useMapIssueStore.getState().issue).toBeNull();
    act(() => mapInstances[0].emit('error', { error: new Error('style') } as never));
    expect(useMapIssueStore.getState().issue).toBe('style');
    useMapIssueStore.setState({ issue: null });
  });

  it('refreshes ground elevation on idle', () => {
    render(<MapView />);
    act(() => useLocationStore.getState().select({ lat: 50, lng: 30 }));
    act(() => mapInstances[0].emit('idle', {} as never));
    expect(useLocationStore.getState().groundM).toBe(180);
  });

  it('reports the scale from the map center on creation', () => {
    useMapScaleStore.setState({ metersPerPx: null });
    render(<MapView />);
    expect(useMapScaleStore.getState().metersPerPx).toBeGreaterThan(0);
  });
});
