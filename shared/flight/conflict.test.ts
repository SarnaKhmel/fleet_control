import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFLICT_LIMITS,
  predictConflict,
  predictObstacleConflict,
  predictTerrainConflict,
  toLocal,
  type Track3D,
} from './conflict';

const limits = { horizontalM: 50, verticalM: 30 };

function track(partial: Partial<Track3D>): Track3D {
  return { east: 0, north: 0, up: 100, vEast: 0, vNorth: 0, vUp: 0, ...partial };
}

describe('predictConflict', () => {
  it('head-on at the same altitude: conflict when they meet', () => {
    const a = track({ north: 0, vNorth: 10 });
    const b = track({ north: 200, vNorth: -10 });
    const r = predictConflict(a, b, limits);
    expect(r.conflict).toBe(true);
    // Closing speed 20 m/s, separation drops below 50 m after 7.5 s → first sample at 8 s.
    expect(r.firstConflictS).toBe(8);
    expect(r.minHorizontalM).toBeLessThan(1);
  });

  it('same route but vertical separation above the limit: no conflict', () => {
    const a = track({ north: 0, vNorth: 10, up: 100 });
    const b = track({ north: 200, vNorth: -10, up: 200 });
    expect(predictConflict(a, b, limits).conflict).toBe(false);
  });

  it('passing overhead within vertical limit: conflict', () => {
    const a = track({ north: 0, vNorth: 10, up: 100 });
    const b = track({ north: 200, vNorth: -10, up: 115 });
    expect(predictConflict(a, b, limits).conflict).toBe(true);
  });

  it('diverging tracks: no conflict', () => {
    const a = track({ north: 0, vNorth: -10 });
    const b = track({ north: 100, vNorth: 10 });
    const r = predictConflict(a, b, limits);
    expect(r.conflict).toBe(false);
    expect(r.minHorizontalM).toBeCloseTo(100);
  });

  it('a conflict beyond the horizon is ignored', () => {
    const a = track({ north: 0, vNorth: 1 });
    const b = track({ north: 1000, vNorth: -1 });
    expect(predictConflict(a, b, limits, 60).conflict).toBe(false);
  });
});

describe('toLocal', () => {
  it('converts a small offset to meters and keeps altitude above sea level', () => {
    const local = toLocal({ lat: 50, lng: 30 }, { lat: 50.001, lng: 30, altM: 130 });
    expect(local.north).toBeCloseTo(110.574, 2);
    expect(local.east).toBeCloseTo(0, 6);
    expect(local.up).toBe(130);
  });
});

describe('predictTerrainConflict', () => {
  it('flat sea level: a drone at 50 m is clear of the ground', () => {
    const drone = track({ up: 50, vEast: 5 });
    expect(predictTerrainConflict(drone, () => 0).conflict).toBe(false);
  });

  it('hill under the flight path: conflict when clearance drops below the limit', () => {
    // Hill at 120 m AMSL on the east side; the drone at 130 m AMSL flies toward it.
    const hill = (east: number) => (east > 100 ? 120 : 0);
    const drone = track({ up: 130, vEast: 10 });
    const r = predictTerrainConflict(drone, hill);
    expect(r.conflict).toBe(true);
    // The drone starts at east 0 and moves 10 m/s; the hill starts at east > 100, i.e. t > 10 s.
    // Clearance = 130 − 120 = 10 m < 20 m, so the first sample in conflict is t = 11 s.
    expect(r.firstConflictS).toBe(11);
  });
});
