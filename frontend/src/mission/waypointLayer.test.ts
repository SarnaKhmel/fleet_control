import { describe, expect, it } from 'vitest';
import { FakeMap } from '../test/maplibreMock';
import type { DroneView } from './missionStore';
import { syncWaypoints, waypointFeatures, WAYPOINT_LINE_ID, WAYPOINT_POINT_ID, WAYPOINT_SOURCE_ID } from './waypointLayer';

const base: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50.1, lng: 30.1 }, heading: 0, altitudeM: 210, speedMs: 10, batteryPct: 90, crabDeg: 0, origin: null, tasks: [] };

describe('drone paths', () => {
  it('draws the path from the departure point through the drone to the last task, with a dot per task', () => {
    const drone = { ...base, origin: { lat: 50, lng: 30 }, tasks: [{ lat: 50.2, lng: 30.2 }, { lat: 50.3, lng: 30.3 }] };
    const { features } = waypointFeatures({ 'drone-1': drone });
    expect(features[0].geometry).toEqual({ type: 'LineString', coordinates: [[30, 50], [30.1, 50.1], [30.2, 50.2], [30.3, 50.3]] });
    expect(features.slice(1).map((f) => f.geometry)).toEqual([
      { type: 'Point', coordinates: [30.2, 50.2] },
      { type: 'Point', coordinates: [30.3, 50.3] },
    ]);
  });

  it('skips drones without tasks or without a position', () => {
    const tasks = [{ lat: 50.2, lng: 30.2 }];
    expect(waypointFeatures({ 'drone-1': base, 'drone-2': { ...base, position: null, tasks } }).features).toEqual([]);
  });

  it('adds the source and both layers to the map', () => {
    const map = new FakeMap({ style: 'x' });
    syncWaypoints(map as never, { 'drone-1': { ...base, tasks: [{ lat: 50.2, lng: 30.2 }] } }, 'dark');
    expect(map.getSource(WAYPOINT_SOURCE_ID)).toBeTruthy();
    expect(map.getLayer(WAYPOINT_LINE_ID)).toBeTruthy();
    expect(map.getLayer(WAYPOINT_POINT_ID)).toBeTruthy();
  });
});
