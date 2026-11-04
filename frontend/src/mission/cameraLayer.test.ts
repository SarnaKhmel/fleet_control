import { describe, expect, it, vi } from 'vitest';
import { toMetersFrom } from '../../../shared/mission/area';
import { FakeMap } from '../test/maplibreMock';
import type { DroneView } from './missionStore';
import { addCameraLayer, cameraFeatures, cameraSector, syncCamera, CAMERA_FILL_ID, CAMERA_LINE_ID, CAMERA_RANGE_M, CAMERA_SOURCE_ID } from './cameraLayer';
import { WAYPOINT_COLORS } from './waypointLayer';

const drone: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 90, altitudeM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, trail: [], tasks: [] };

describe('camera view', () => {
  it('is a closed sector from the drone, as long as the camera range', () => {
    const ring = cameraSector(drone.position!, 0);
    expect(ring[0]).toEqual(drone.position);
    expect(ring.at(-1)).toEqual(drone.position);
    for (const p of ring.slice(1, -1)) {
      const { east, north } = toMetersFrom(drone.position!, p);
      expect(Math.hypot(east, north)).toBeCloseTo(CAMERA_RANGE_M, 0);
    }
  });

  it('points along the heading and spans the field of view', () => {
    const ring = cameraSector(drone.position!, 90, 60).slice(1, -1).map((p) => toMetersFrom(drone.position!, p));
    // Heading 90 looks east: the edges are 60 degrees apart, at bearings 60 and 120.
    const bearing = ({ east, north }: { east: number; north: number }) => (Math.atan2(east, north) * 180) / Math.PI;
    expect(bearing(ring[0])).toBeCloseTo(60, 0);
    expect(bearing(ring.at(-1)!)).toBeCloseTo(120, 0);
    expect(bearing(ring[Math.floor(ring.length / 2)])).toBeCloseTo(90, 0);
  });

  it('looks along the track, not the nose, when the drone crabs into the wind', () => {
    // Nose at 100 degrees, turned 10 degrees right of the track: the drone goes east (90).
    const [feature] = cameraFeatures({ 'drone-1': { ...drone, heading: 100, crabDeg: 10 } }, ['drone-1']).features;
    const ring = feature.geometry.coordinates[0];
    const [lng, lat] = ring[Math.floor(ring.length / 2)];
    const { east, north } = toMetersFrom(drone.position!, { lat, lng });
    expect((Math.atan2(east, north) * 180) / Math.PI).toBeCloseTo(90, 0);
  });

  it('shows only selected drones with a position and a heading', () => {
    const drones = { 'drone-1': drone, 'drone-2': drone, 'drone-3': { ...drone, heading: null }, 'drone-4': { ...drone, position: null } };
    expect(cameraFeatures(drones, []).features).toEqual([]);
    const ids = cameraFeatures(drones, ['drone-1', 'drone-2', 'drone-3', 'drone-4']).features.map((f) => f.properties.droneId);
    expect(ids).toEqual(['drone-1', 'drone-2']);
  });

  it('adds the fill and outline once, fills them and follows the theme', () => {
    const map = new FakeMap({ style: 'x' });
    syncCamera(map as never, { 'drone-1': drone }, ['drone-1'], 'dark');
    expect(map.getSource(CAMERA_SOURCE_ID)).toBeUndefined();
    addCameraLayer(map as never, 'dark');
    addCameraLayer(map as never, 'dark');
    const paint = vi.spyOn(map, 'setPaintProperty');
    expect(map.getLayer(CAMERA_FILL_ID)).toBeTruthy();
    expect(map.getLayer(CAMERA_LINE_ID)).toBeTruthy();
    syncCamera(map as never, { 'drone-1': drone }, ['drone-1'], 'light');
    const source = map.getSource(CAMERA_SOURCE_ID) as unknown as { data: { features: unknown[] } };
    expect(source.data.features).toHaveLength(1);
    expect(paint).toHaveBeenCalledWith(CAMERA_FILL_ID, 'fill-color', WAYPOINT_COLORS.light);
    expect(paint).toHaveBeenCalledWith(CAMERA_LINE_ID, 'line-color', WAYPOINT_COLORS.light);
  });
});
