import { describe, expect, it } from 'vitest';
import type { Building, Buildings } from '../buildings/buildings';
import type { MissionArea } from '../../../shared/protocol';
import { isInsideArea, offsetLatLng, toMetersFrom } from '../../../shared/mission/area';
import { ENEMY_MIN_DISTANCE_M } from '../../../shared/mission/units';
import { ENEMY_ECHELONS, frontBearing, generateForces, MIN_SPACING_M, MOBILE_KINDS, moveUnit, nearestStartM, type ForceUnit } from './forces';
import { SPEED_RANGE_MS } from '../../../shared/mission/units';
import { UNIT_KINDS } from '../../../shared/mission/units';
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
    expect(rear.length).toBe(4);
    for (const unit of rear) expect(toMetersFrom(south[0], unit.position).north).toBeLessThan(0);
  });

  it('places every kind, some known in advance, a few vehicles on the move, and units apart from each other', () => {
    const units = generateForces(area, south, seeded(3));
    const kinds = new Set(enemies(units).map((u) => u.kind));
    expect([...kinds].sort()).toEqual(['air_defense', 'artillery', 'ew', 'infantry', 'position', 'radar', 'vehicle']);
    expect(enemies(units).some((u) => u.intel)).toBe(true);
    expect(enemies(units).some((u) => !u.intel)).toBe(true);
    // Only infantry and vehicles move, on both sides, at their speed; the others stand.
    for (const unit of units.filter((u) => u.speedMs > 0)) {
      expect(MOBILE_KINDS).toContain(unit.kind);
      const [lo, hi] = SPEED_RANGE_MS[unit.kind as 'infantry' | 'vehicle'].offRoad;
      expect(unit.speedMs).toBeGreaterThanOrEqual(lo);
      expect(unit.speedMs).toBeLessThanOrEqual(hi);
    }
    expect(units.filter((u) => !MOBILE_KINDS.includes(u.kind)).every((u) => u.speedMs === 0)).toBe(true);
    const movers = (seed: number) => generateForces(area, separate, seeded(seed)).filter((u) => u.speedMs > 0);
    const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(seeds.some((seed) => movers(seed).some((u) => u.side === 'enemy'))).toBe(true);
    expect(seeds.some((seed) => movers(seed).some((u) => u.side === 'ally'))).toBe(true);
    expect(units.filter((u) => u.side === 'ally').every((u) => u.intel)).toBe(true);
    for (const a of units) for (const b of units) if (a !== b) expect(distanceM(a.position, b.position)).toBeGreaterThanOrEqual(MIN_SPACING_M);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    expect(units[0].id).toBe('enemy-1');
    expect(units.find((u) => u.side === 'ally')!.id).toBe('ally-1');
  });

  it('still places every kind in a small zone, squeezed toward the start, and keeps the 3 km rule', () => {
    const small: MissionArea = { center: area.center, widthKm: 12, heightKm: 12 };
    const start = [offsetLatLng(area.center, 0, -5000)];
    for (let seed = 1; seed <= 5; seed++) {
      const units = enemies(generateForces(small, start, seeded(seed)));
      expect(new Set(units.map((u) => u.kind))).toEqual(new Set(UNIT_KINDS));
      for (const unit of units) {
        expect(nearestStartM(unit.position, start)).toBeGreaterThanOrEqual(ENEMY_MIN_DISTANCE_M);
        expect(isInsideArea(unit.position, small)).toBe(true);
      }
    }
  });

  it('keeps the echelon order in a small zone too', () => {
    const small: MissionArea = { center: area.center, widthKm: 12, heightKm: 12 };
    const start = [offsetLatLng(area.center, 0, -5000)];
    const units = enemies(generateForces(small, start, seeded(9)));
    const far = (kinds: string[]) => Math.min(...units.filter((u) => kinds.includes(u.kind)).map((u) => nearestStartM(u.position, start)));
    const near = Math.max(...units.filter((u) => ['infantry', 'position'].includes(u.kind)).map((u) => nearestStartM(u.position, start)));
    expect(far(['artillery'])).toBeGreaterThan(near - 1);
    expect(far(['air_defense', 'ew', 'radar'])).toBeGreaterThan(near - 1);
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
  it('draws a new speed within the range of the kind for each new leg', () => {
    const [lo, hi] = SPEED_RANGE_MS.vehicle.offRoad;
    const truck = { id: 'enemy-9', side: 'enemy' as const, kind: 'vehicle' as const, position: offsetLatLng(south[0], 0, 0), headingDeg: 0, speedMs: lo, intel: true, band: [0, 100_000] as [number, number], waypoint: null };
    const speeds = new Set<number>();
    for (let i = 0; i < 20; i++) {
      moveUnit(truck, area, south, 10, seeded(i + 1));
      expect(truck.speedMs).toBeGreaterThanOrEqual(lo);
      expect(truck.speedMs).toBeLessThanOrEqual(hi);
      speeds.add(truck.speedMs);
      truck.waypoint = null;
    }
    expect(speeds.size).toBeGreaterThan(1);
  });

  // A block of houses 150–250 m east of the start: 40 m tall, nothing else.
  const houses: Buildings = {
    at: (p) => {
      const { east } = toMetersFrom(south[0], p);
      return east > 150 && east < 250 ? ({ rings: [], heightM: 40, south: 0, north: 0, west: 0, east: 0 } as Building) : null;
    },
  };

  it('does not drive a vehicle into a building: it waits and takes another leg', () => {
    // Heading east at 6 m/s: a 60 m step from 100 m reaches the houses at 150 m.
    const truck = { id: 'enemy-9', side: 'enemy' as const, kind: 'vehicle' as const, position: offsetLatLng(south[0], 100, 0), headingDeg: 90, speedMs: 6, intel: true, band: [0, 100_000] as [number, number], waypoint: offsetLatLng(south[0], 400, 0) };
    expect(moveUnit(truck, area, south, 10, Math.random, () => false, houses)).toBe(false);
    expect(truck.position).toEqual(offsetLatLng(south[0], 100, 0));
    expect(truck.waypoint).toBeNull();
  });

  it('lets infantry walk into a building', () => {
    const foot = { id: 'enemy-9', side: 'enemy' as const, kind: 'infantry' as const, position: offsetLatLng(south[0], 145, 0), headingDeg: 90, speedMs: 1.5, intel: true, band: [0, 100_000] as [number, number], waypoint: offsetLatLng(south[0], 400, 0) };
    expect(moveUnit(foot, area, south, 10, Math.random, () => false, houses)).toBe(true);
    expect(houses.at(foot.position)).not.toBeNull();
  });

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
