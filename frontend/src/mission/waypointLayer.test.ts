import { describe, expect, it, vi } from 'vitest';
import { FakeMap } from '../test/maplibreMock';
import type { DroneView } from './missionStore';
import { addWaypointLayer, syncWaypoints, waypointFeatures, WAYPOINT_LINE_ID, WAYPOINT_SOURCE_ID } from './waypointLayer';

const base: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50.1, lng: 30.1 }, heading: 0, altitudeM: 210, speedMs: 10, batteryPct: 90, crabDeg: 0, trail: [], tasks: [] };
const flying: DroneView = { ...base, trail: [{ lat: 50, lng: 30 }], tasks: [{ lat: 50.2, lng: 30.2 }, { lat: 50.3, lng: 30.3 }] };

describe('drone paths', () => {
  it('draws the flown part up to the drone and the part ahead to its last task', () => {
    const { features } = waypointFeatures({ 'drone-1': flying }, ['drone-1']);
    expect(features.map((f) => [f.properties.part, f.geometry.coordinates])).toEqual([
      ['flown', [[30, 50], [30.1, 50.1]]],
      ['ahead', [[30.1, 50.1], [30.2, 50.2], [30.3, 50.3]]],
    ]);
  });

  it('keeps the flown path after the tasks are done', () => {
    const done = { ...flying, tasks: [] };
    expect(waypointFeatures({ 'drone-1': done }, ['drone-1']).features.map((f) => f.properties.part)).toEqual(['flown']);
  });

  it('shows only the selected drones, all of them when several are selected', () => {
    const drones = { 'drone-1': flying, 'drone-2': flying, 'drone-3': flying };
    expect(waypointFeatures(drones, []).features).toEqual([]);
    const ids = waypointFeatures(drones, ['drone-1', 'drone-3']).features.map((f) => f.properties.droneId);
    expect([...new Set(ids)]).toEqual(['drone-1', 'drone-3']);
  });

  it('skips a selected drone without a position', () => {
    expect(waypointFeatures({ 'drone-1': { ...flying, position: null } }, ['drone-1']).features).toEqual([]);
  });

  it('adds the source and the dashed line layer once, then fills it with the paths', () => {
    const map = new FakeMap({ style: 'x' });
    addWaypointLayer(map as never, 'dark');
    addWaypointLayer(map as never, 'dark');
    expect(map.getLayer(WAYPOINT_LINE_ID)).toBeTruthy();
    syncWaypoints(map as never, { 'drone-1': flying }, ['drone-1'], 'dark');
    const source = map.getSource(WAYPOINT_SOURCE_ID) as unknown as { data: { features: unknown[] } };
    expect(source.data.features).toHaveLength(2);
  });

  it('updates the path while map tiles are still loading, once its source exists', () => {
    // MapLibre reports the style as not loaded while any source loads tiles, which is most of the time.
    const map = new FakeMap({ style: 'x' });
    map.isStyleLoaded = () => false;
    const setData = vi.fn();
    map.sources[WAYPOINT_SOURCE_ID] = { setData };
    map.layers[WAYPOINT_LINE_ID] = { id: WAYPOINT_LINE_ID };
    syncWaypoints(map as never, { 'drone-1': flying }, ['drone-1'], 'dark');
    expect(setData).toHaveBeenCalledOnce();
  });

  it('does nothing before the layer is added', () => {
    const map = new FakeMap({ style: 'x' });
    syncWaypoints(map as never, { 'drone-1': flying }, ['drone-1'], 'dark');
    expect(map.getSource(WAYPOINT_SOURCE_ID)).toBeUndefined();
  });
});
