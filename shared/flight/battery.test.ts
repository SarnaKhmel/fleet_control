import { describe, expect, it } from 'vitest';
import { toMetersFrom } from '../mission/area.js';
import { airDrainPctPerS, enduranceS, groundDrainPctPerS, rangeOutline } from './battery.js';

const at = { lat: 50, lng: 30 };
const distance = (p: { lat: number; lng: number }) => {
  const { east, north } = toMetersFrom(at, p);
  return Math.hypot(east, north);
};

describe('battery model', () => {
  it('lasts 40 minutes at 10 m/s, longer when hovering, much shorter when fast', () => {
    expect(enduranceS(100, 10)).toBeCloseTo(2400, 6);
    expect(enduranceS(100, 0)).toBeCloseTo(4000, 6); // 60 % of the power
    expect(airDrainPctPerS(20) / airDrainPctPerS(10)).toBeCloseTo(2.2, 6);
    expect(airDrainPctPerS(30) / airDrainPctPerS(10)).toBeCloseTo(4.2, 6);
    expect(enduranceS(50, 10)).toBeCloseTo(1200, 6);
    expect(enduranceS(-1, 10)).toBe(0);
  });

  it('uses 20 times less on the ground', () => {
    expect(airDrainPctPerS(10) / groundDrainPctPerS()).toBeCloseTo(20, 6);
  });

  it('flies furthest at a moderate speed: too slow crawls, too fast drains', () => {
    const reach = (v: number) => v * enduranceS(100, v);
    expect(reach(12)).toBeGreaterThan(reach(8));
    expect(reach(12)).toBeGreaterThan(reach(20));
  });
});

describe('range outline', () => {
  it('is a circle of speed x endurance in calm air', () => {
    const ring = rangeOutline(at, 100, 10, { speedMs: 0, fromDeg: 0 });
    expect(ring).toHaveLength(73);
    for (const p of ring) expect(distance(p)).toBeCloseTo(24_000, -1);
  });

  it('reaches further downwind and less far upwind', () => {
    // Wind from the north at 4 m/s: south is downwind (14 m/s over the ground), north upwind (6 m/s).
    const ring = rangeOutline(at, 100, 10, { speedMs: 4, fromDeg: 0 }, 4);
    const [north, east, south] = ring.map(distance);
    expect(north).toBeCloseTo(6 * 2400, -1);
    expect(south).toBeCloseTo(14 * 2400, -1);
    expect(east).toBeGreaterThan(north);
    expect(east).toBeLessThan(south);
  });

  it('gets nowhere against a wind stronger than its airspeed', () => {
    const [north, , south] = rangeOutline(at, 100, 10, { speedMs: 12, fromDeg: 0 }, 4).map(distance);
    expect(north).toBe(0);
    expect(south).toBeGreaterThan(0);
  });
});
