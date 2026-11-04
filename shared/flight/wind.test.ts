import { describe, expect, it } from 'vitest';
import {
  droneVectors,
  signedAngleDeg,
  velocityToBearing,
  windCorrection,
  windVelocity,
} from './wind';

const close = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);

describe('windVelocity', () => {
  it('wind from the east blows to the west', () => {
    const v = windVelocity({ speedMs: 5, fromDeg: 90 });
    close(v.east, -5);
    close(v.north, 0);
  });
});

describe('signedAngleDeg', () => {
  it('wraps around north', () => {
    close(signedAngleDeg(350, 10), 20);
    close(signedAngleDeg(10, 350), -20);
  });
});

describe('windCorrection', () => {
  it('no wind: heading equals track', () => {
    const c = windCorrection(45, 10, { speedMs: 0, fromDeg: 0 });
    close(c.headingDeg, 45);
    close(c.correctionDeg, 0);
    close(c.groundSpeedMs, 10);
    expect(c.feasible).toBe(true);
  });

  it('wind pushing right (from the west): nose points left of track', () => {
    // Track north, airspeed 10 m/s, 3 m/s wind from the west blows east.
    const c = windCorrection(0, 10, { speedMs: 3, fromDeg: 270 });
    close(c.correctionDeg, -17.46);
    close(c.headingDeg, 342.54);
    close(c.groundSpeedMs, Math.sqrt(100 - 9));
    expect(c.feasible).toBe(true);
  });

  it('wind pushing left (from the east): nose points right of track', () => {
    const c = windCorrection(0, 10, { speedMs: 3, fromDeg: 90 });
    close(c.correctionDeg, 17.46);
  });

  it('headwind reduces ground speed and keeps the track', () => {
    const c = windCorrection(0, 10, { speedMs: 4, fromDeg: 0 });
    close(c.headingDeg, 0);
    close(c.groundSpeedMs, 6);
  });

  it('wind stronger than airspeed sideways is not feasible', () => {
    const c = windCorrection(0, 10, { speedMs: 12, fromDeg: 270 });
    expect(c.feasible).toBe(false);
  });
});

describe('droneVectors', () => {
  it('corrected heading: ground vector points along the route', () => {
    const wind = { speedMs: 3, fromDeg: 270 };
    const { headingDeg } = windCorrection(0, 10, wind);
    const v = droneVectors({ trackDeg: 0, headingDeg, airspeedMs: 10, wind, horizonS: 30 });

    close(velocityToBearing(v.ground), 0, 1);
    close(v.ground.east, 0, 1);
    close(v.route.north, 300);
  });

  it('uncorrected heading: ground vector drifts off the route', () => {
    const wind = { speedMs: 3, fromDeg: 270 };
    const v = droneVectors({ trackDeg: 0, headingDeg: 0, airspeedMs: 10, wind, horizonS: 30 });

    expect(v.ground.east).toBeGreaterThan(0); // pushed east (right)
    expect(v.heading.north).toBeCloseTo(300, 1);
  });
});
