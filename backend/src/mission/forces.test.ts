import { describe, expect, it } from 'vitest';
import type { MissionArea } from '../../../shared/protocol';
import { isInsideArea, offsetLatLng, toMetersFrom } from '../../../shared/mission/area';
import { ENEMY_MIN_DISTANCE_M } from '../../../shared/mission/units';
import { ENEMY_ECHELONS, frontBearing, generateForces, MIN_SPACING_M, moveUnit, MOVING_VEHICLES, nearestStartM, type ForceUnit } from './forces';
import { bearingTo } from './kinematics';

/** A repeatable random sequence (mulberry32), so a failing case can be replayed. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const area: MissionArea = { center: { lat: 50, lng: 30 }, widthKm: 50, heightKm: 50 };
// Start 15 km south of the center: the front faces north.
const south = [offsetLatLng(area.center, 0, -15000)];
const separate = [offsetLatLng(area.center, -8000, -12000), offsetLatLng(area.center, 0, -14000), offsetLatLng(area.center, 9000, -11000)];

const enemies = (units: ForceUnit[]) => units.filter((u) => u.side === 'enemy');
const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const { east, north } = toMetersFrom(a, b);
  return Math.hypot(east, north);
};

describe('generateForces', () => {
  it('keeps every enemy at least 3 km from every start point, inside the area', () => {
    for (const starts of [south, separate, [area.center]]) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const unit of enemies(generateForces(area, starts, seeded(seed)))) {
          expect(nearestStartM(unit.position, starts)).toBeGreaterThanOrEqual(ENEMY_MIN_DISTANCE_M);
          expect(isInsideArea(unit.position, area)).toBe(true);
        }
      }
    }
  });

  it('stands the enemy in echelons: artillery, air defence, EW and radar always behind the infantry', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const units = enemies(generateForces(area, separate, seeded(seed)));
      const distance = (kinds: string[]) => units.filter((u) => kinds.includes(u.kind)).map((u) => nearestStartM(u.position, separate));
      const front = Math.max(...distance(['infantry', 'position']));
      expect(Math.min(...distance(['artillery']))).toBeGreaterThan(front);
      expect(Math.min(...distance(['air_defense', 'ew', 'radar']))).toBeGreaterThan(front);
      for (const unit of units) {
        const d = nearestStartM(unit.position, separate);
        expect(d).toBeGreaterThanOrEqual(ENEMY_ECHELONS[unit.kind][0]);
        expect(d).toBeLessThanOrEqual(ENEMY_ECHELONS[unit.kind][1]);
      }
    }
  });

  it('places the enemy in front, toward the area center, and the allied rear behind the start', () => {
    const units = generateForces(area, south, seeded(7));
    for (const unit of enemies(units)) expect(toMetersFrom(south[0], unit.position).north).toBeGreaterThan(0);
    const rear = units.filter((u) => u.side === 'ally' && (u.kind === 'artillery' || u.kind === 'air_defense'));
    expect(rear.length).toBe(2);
    for (const unit of rear) expect(toMetersFrom(south[0], unit.position).north).toBeLessThan(0);
  });

  it('places every kind, some known in advance, a few vehicles on the move, and units apart from each other', () => {
    const units = generateForces(area, south, seeded(3));
    const kinds = new Set(enemies(units).map((u) => u.kind));
    expect([...kinds].sort()).toEqual(['air_defense', 'artillery', 'ew', 'infantry', 'position', 'radar', 'vehicle']);
    expect(enemies(units).some((u) => u.intel)).toBe(true);
    expect(enemies(units).some((u) => !u.intel)).toBe(true);
    expect(units.filter((u) => u.speedMs > 0).every((u) => u.kind === 'vehicle' && u.side === 'enemy')).toBe(true);
    expect(units.filter((u) => u.speedMs > 0)).toHaveLength(MOVING_VEHICLES);
    expect(units.filter((u) => u.side === 'ally').every((u) => u.intel)).toBe(true);
    for (const a of units) for (const b of units) if (a !== b) expect(distanceM(a.position, b.position)).toBeGreaterThanOrEqual(MIN_SPACING_M);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    expect(units[0].id).toBe('enemy-1');
    expect(units.find((u) => u.side === 'ally')!.id).toBe('ally-1');
  });

  it('leaves out what does not fit in a small area rather than break the rules', () => {
    const small: MissionArea = { center: area.center, widthKm: 12, heightKm: 12 };
    const start = [offsetLatLng(area.center, 0, -5000)];
    const units = enemies(generateForces(small, start, seeded(5)));
    expect(units.some((u) => u.kind === 'radar')).toBe(false); // 14 km back is outside the area
    for (const unit of units) expect(nearestStartM(unit.position, start)).toBeGreaterThanOrEqual(ENEMY_MIN_DISTANCE_M);
  });
});

describe('water', () => {
  // A lake: everything 2 to 9 km north of the start points. Land elsewhere.
  const lake = (p: { lat: number; lng: number }) => {
    const north = toMetersFrom(south[0], p).north;
    return north > 2000 && north < 9000;
  };

  it('places no unit on water', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const unit of generateForces(area, south, seeded(seed), lake)) expect(lake(unit.position)).toBe(false);
    }
  });

  it('does not step a moving unit onto water: it waits and takes another leg', () => {
    const boat = { id: 'enemy-9', side: 'enemy' as const, kind: 'vehicle' as const, position: offsetLatLng(south[0], 0, 1995), headingDeg: 0, speedMs: 6, intel: true, band: [0, 100_000] as [number, number], waypoint: offsetLatLng(south[0], 0, 3000) };
    // Heading north into the lake: the unit does not enter it.
    expect(moveUnit(boat, area, south, 10, Math.random, lake)).toBe(false);
    expect(boat.position).toEqual(offsetLatLng(south[0], 0, 1995));
    expect(boat.waypoint).toBeNull();
  });
});

describe('frontBearing', () => {
  it('faces from the start points toward the area center', () => {
    expect(frontBearing(area, south, Math.random)).toBeCloseTo(0, 5);
    expect(frontBearing(area, [offsetLatLng(area.center, 10000, 0)], Math.random)).toBeCloseTo(270, 5);
  });

  it('takes any side when the drones start at the center', () => {
    expect(frontBearing(area, [area.center], () => 0.25)).toBe(90);
  });
});

describe('moveUnit', () => {
  it('drives a moving vehicle at its speed and points its heading the way it goes, never into the 3 km ring', () => {
    const vehicle = generateForces(area, south, seeded(11)).find((u) => u.speedMs > 0)!;
    const random = seeded(12);
    for (let tick = 0; tick < 2000; tick++) {
      const from = vehicle.position;
      expect(moveUnit(vehicle, area, south, 10, random)).toBe(true);
      expect(distanceM(from, vehicle.position)).toBeLessThanOrEqual(vehicle.speedMs * 10 + 0.01);
      if (distanceM(from, vehicle.position) > 1) expect(vehicle.headingDeg).toBeCloseTo(bearingTo(from, vehicle.position), 0);
      expect(nearestStartM(vehicle.position, south)).toBeGreaterThanOrEqual(ENEMY_MIN_DISTANCE_M);
      expect(isInsideArea(vehicle.position, area)).toBe(true);
    }
  });

  it('leaves standing units where they are', () => {
    const post = generateForces(area, south, seeded(11)).find((u) => u.kind === 'artillery')!;
    const at = post.position;
    expect(moveUnit(post, area, south, 10)).toBe(false);
    expect(post.position).toBe(at);
  });
});
