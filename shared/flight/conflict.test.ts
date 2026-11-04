import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFLICT_LIMITS,
  predictConflict,
  predictObstacleConflict,
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
  it('converts a small offset to meters', () => {
    const local = toLocal(
      { lat: 50, lng: 30, altM: 100 },
      { lat: 50.001, lng: 30, altM: 130 },
    );
    expect(local.north).toBeCloseTo(110.574, 2);
    expect(local.east).toBeCloseTo(0, 6);
    expect(local.up).toBe(30);
  });
});

describe('default limits', () => {
  it('are 20 m horizontal and 20 m vertical', () => {
    expect(DEFAULT_CONFLICT_LIMITS).toEqual({ horizontalM: 20, verticalM: 20 });
  });
});

describe('predictObstacleConflict', () => {
  const tower = { east: 0, north: 0, radiusM: 5, topUp: 120 };

  it('drone flying into a tall obstacle below its top: conflict', () => {
    const drone = track({ east: -200, up: 100, vEast: 10 });
    const r = predictObstacleConflict(drone, tower);
    expect(r.conflict).toBe(true);
    // Gap = |x| - 5 m; x = -200 + 10t, so gap < 20 m once x > -25, i.e. t > 17.5 s → first sample 18 s.
    expect(r.firstConflictS).toBe(18);
  });

  it('drone above the top plus margin: no conflict', () => {
    const drone = track({ east: -200, up: 200, vEast: 10 });
    expect(predictObstacleConflict(drone, tower).conflict).toBe(false);
  });

  it('drone passing well outside the footprint: no conflict', () => {
    const drone = track({ east: -200, north: 100, up: 50, vEast: 10 });
    const r = predictObstacleConflict(drone, tower);
    expect(r.conflict).toBe(false);
    expect(r.minHorizontalM).toBeGreaterThan(20);
  });
});
