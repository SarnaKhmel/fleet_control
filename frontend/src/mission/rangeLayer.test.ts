import { describe, expect, it, vi } from 'vitest';
import { toMetersFrom } from '../../../shared/mission/area';
import { FakeMap } from '../test/maplibreMock';
import type { DroneView } from './missionStore';
import { addRangeLayer, rangeFeatures, syncRange, RANGE_LINE_ID, RANGE_SOURCE_ID } from './rangeLayer';
import { WAYPOINT_COLORS } from './waypointLayer';

const drone: DroneView = { callsign: 'BA-01', status: 'moving', cause: null, warning: null, progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 10, batteryPct: 50, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] };
const calm = { speedMs: 0, fromDeg: 0 };

describe('range layer', () => {
  it('draws a closed outline around each selected drone that takes commands', () => {
    const drones = { 'drone-1': drone, 'drone-2': drone, 'drone-3': { ...drone, status: 'destroyed' as const }, 'drone-4': { ...drone, position: null } };
    const { features } = rangeFeatures(drones, ['drone-1', 'drone-3', 'drone-4'], calm);
    expect(features.map((f) => f.properties.droneId)).toEqual(['drone-1']);
    const ring = features[0].geometry.coordinates;
    expect(ring[0]).toEqual(ring.at(-1));
    // Half a charge at 10 m/s: 1200 s, 12 km; due north of the drone first.
    expect(toMetersFrom({ lat: 50, lng: 30 }, { lat: ring[0][1], lng: ring[0][0] }).north).toBeCloseTo(12_000, 0);
  });

  it('shrinks as the battery runs down and stretches downwind', () => {
    const north = (d: DroneView, wind = calm) => rangeFeatures({ 'drone-1': d }, ['drone-1'], wind).features[0].geometry.coordinates[0][1];
    expect(north({ ...drone, batteryPct: 25 })).toBeLessThan(north(drone));
    expect(north(drone, { speedMs: 4, fromDeg: 180 })).toBeGreaterThan(north(drone));
  });

  it('adds its source and layer once, fills them and follows the theme', () => {
    const map = new FakeMap({ style: 'x' });
    syncRange(map as never, { 'drone-1': drone }, ['drone-1'], calm, 'dark');
    expect(map.getSource(RANGE_SOURCE_ID)).toBeUndefined();
    addRangeLayer(map as never, 'dark');
    addRangeLayer(map as never, 'dark');
    const paint = vi.spyOn(map, 'setPaintProperty');
    syncRange(map as never, { 'drone-1': drone }, ['drone-1'], calm, 'light');
    expect((map.getSource(RANGE_SOURCE_ID) as unknown as { data: { features: unknown[] } }).data.features).toHaveLength(1);
    expect(paint).toHaveBeenCalledWith(RANGE_LINE_ID, 'line-color', WAYPOINT_COLORS.light);
  });
});
