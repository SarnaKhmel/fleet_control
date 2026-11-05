import { describe, expect, it } from 'vitest';
import { toMetersFrom } from '../../../shared/mission/area.js';
import type { Buildings, Building } from '../buildings/buildings.js';
import { bearingTo } from './kinematics.js';
import { DEFAULT_ODDS, type MissionOdds } from '../../../shared/mission/odds.js';
import { clearTrack, distanceM, drawStrike, PURSUIT_MAX_M, PURSUIT_MIN_M, PURSUIT_ORBIT_PERIOD_S, pursuitPost, pursuitRangeM } from './engagement.js';

const center = { lat: 50, lng: 30 };
const standing = { headingDeg: null, speedMs: 0 };

/** The bearing from `from` to `to`, degrees, within [0, 360). */
function bearingFrom(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  return bearingTo(from, to);
}

describe('pursuit range', () => {
  it('swings between the minimum and the maximum distance and never leaves them', () => {
    const ranges = Array.from({ length: 400 }, (_, t) => pursuitRangeM(t * 2));
    expect(Math.min(...ranges)).toBeCloseTo(PURSUIT_MIN_M, 0);
    expect(Math.max(...ranges)).toBeCloseTo(PURSUIT_MAX_M, 0);
    expect(ranges.every((r) => r >= PURSUIT_MIN_M - 1e-9 && r <= PURSUIT_MAX_M + 1e-9)).toBe(true);
  });
});

describe('pursuit post', () => {
  it('lies at the current range from a standing unit', () => {
    for (const clockS of [0, 17, 45, 90, 200]) {
      const post = pursuitPost({ position: center, ...standing }, 0, clockS);
      expect(distanceM(center, post)).toBeCloseTo(pursuitRangeM(clockS), 3);
    }
  });

  it('circles a standing unit: the bearing from it advances one full turn per orbit period', () => {
    const quarter = PURSUIT_ORBIT_PERIOD_S / 4;
    const bearings = [0, quarter, 2 * quarter, 3 * quarter].map((clockS) => bearingFrom(center, pursuitPost({ position: center, ...standing }, 0, clockS)));
    expect(bearings[0]).toBeCloseTo(0, 3);
    expect(bearings[1]).toBeCloseTo(90, 3);
    expect(bearings[2]).toBeCloseTo(180, 3);
    expect(bearings[3]).toBeCloseTo(270, 3);
  });

  it('settles behind a moving unit: opposite its course, whatever the time', () => {
    const unit = { position: center, headingDeg: 30, speedMs: 6 };
    for (const clockS of [0, 25, 60, 140]) {
      const post = pursuitPost(unit, 200, clockS);
      expect(bearingFrom(center, post)).toBeCloseTo(210, 3); // course 30° + 180°
    }
  });
});

describe('clear track', () => {
  // A tower straight ahead on the way north, 100 m tall across 200 m of ground.
  const tower: Buildings = {
    at: (p) => {
      const { east, north } = toMetersFrom(center, p);
      return Math.abs(east) < 100 && north > 150 && north < 350 ? ({ rings: [], heightM: 100 } as Building) : null;
    },
  };
  const none: Buildings = { at: () => null };

  it('keeps the wanted track when nothing is in the way', () => {
    expect(clearTrack(none, center, 0, 300, 60)).toBe(0);
  });

  it('turns aside from a building ahead, to the nearest clear track', () => {
    const track = clearTrack(tower, center, 0, 400, 60);
    expect(track).not.toBe(0);
    expect(Math.abs(track)).toBeLessThanOrEqual(90);
  });

  it('keeps the wanted track when the building is below the drone', () => {
    expect(clearTrack(tower, center, 0, 400, 200)).toBe(0);
  });
});

describe('strike outcome', () => {
  it('a vehicle is destroyed 40%, damaged 50%, unharmed 10% of the time, and never shoots the drone down', () => {
    expect(drawStrike('vehicle', () => 0.1, DEFAULT_ODDS)).toEqual({ outcome: 'destroyed', shotDown: false });
    expect(drawStrike('vehicle', () => 0.45, DEFAULT_ODDS)).toEqual({ outcome: 'damaged', shotDown: false });
    expect(drawStrike('vehicle', () => 0.95, DEFAULT_ODDS)).toEqual({ outcome: 'unharmed', shotDown: false });
  });

  it('infantry is destroyed 30%, damaged 40%, unharmed 30%, and shoots the drone down 20% of the time first', () => {
    // Below 0.2: the drone is shot down, so no hit is drawn.
    expect(drawStrike('infantry', () => 0.1, DEFAULT_ODDS)).toEqual({ outcome: null, shotDown: true });
    expect(drawStrike('infantry', () => 0.25, DEFAULT_ODDS)).toEqual({ outcome: 'destroyed', shotDown: false });
    expect(drawStrike('infantry', () => 0.5, DEFAULT_ODDS)).toEqual({ outcome: 'damaged', shotDown: false });
    expect(drawStrike('infantry', () => 0.8, DEFAULT_ODDS)).toEqual({ outcome: 'unharmed', shotDown: false });
  });

  it('draws the odds over many strikes: a fifth of the infantry strikes are shot down, the rest split 30:40:30', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const share = { destroyed: 0, damaged: 0, unharmed: 0, shotDown: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const drawn = drawStrike('infantry', random, DEFAULT_ODDS);
      if (drawn.shotDown) share.shotDown++;
      else share[drawn.outcome!]++;
    }
    const close = (count: number, expected: number) => expect(Math.abs(count / n - expected)).toBeLessThan(0.01);
    close(share.shotDown, 0.2);
    close(share.destroyed, 0.8 * 0.3);
    close(share.damaged, 0.8 * 0.4);
    close(share.unharmed, 0.8 * 0.3);
  });
});

describe('strike odds from the mission', () => {
  it('uses the odds the mission was started with', () => {
    const allDestroyed: MissionOdds = { ...DEFAULT_ODDS, vehicle: { destroyed: 1, damaged: 0 }, infantryShootsDown: 0 };
    expect(drawStrike('vehicle', () => 0.99, allDestroyed)).toEqual({ outcome: 'destroyed', shotDown: false });
    const shootsAll: MissionOdds = { ...DEFAULT_ODDS, infantryShootsDown: 1 };
    expect(drawStrike('infantry', () => 0.99, shootsAll)).toEqual({ outcome: null, shotDown: true });
  });
});

describe('depots and bases', () => {
  it('fight like a position: they shoot the drone down first and their strikes use the infantry odds', () => {
    for (const kind of ['depot', 'base'] as const) {
      expect(drawStrike(kind, () => 0.1, DEFAULT_ODDS)).toEqual({ outcome: null, shotDown: true });
      expect(drawStrike(kind, () => 0.25, DEFAULT_ODDS)).toEqual({ outcome: 'destroyed', shotDown: false });
    }
  });
});
