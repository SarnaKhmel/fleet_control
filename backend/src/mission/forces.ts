import type { LatLng, MissionArea } from '../../../shared/protocol.js';
import { isInsideArea, offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { ENEMY_MIN_DISTANCE_M, type UnitKind, type UnitSide } from '../../../shared/mission/units.js';
import { bearingTo, stepToward } from './kinematics.js';

// The enemy and our own forces on the ground for one mission, placed when it starts.
//
// The enemy stands in echelons: the further back the kind of unit, the further from our start points it
// is (measured to the nearest one). Infantry and positions are closest, artillery behind them, air
// defence, EW and radar deepest, and no band reaches over another's back edge, so artillery or EW never
// stands in front of the infantry. Nothing of the enemy comes closer than ENEMY_MIN_DISTANCE_M.
// The enemy lies in a sector in front of us: from the middle of the start points toward the mission area
// center (any direction when we start at the center). Allies hold the near side: infantry and vehicles a
// little forward, artillery and air defence behind the start points.

export type Random = () => number;
/** Whether a point is on water: no unit stands or drives there. */
export type IsWater = (point: LatLng) => boolean;
const NO_WATER_CHECK: IsWater = () => false;

/** How far the mission area reaches from the point: its farthest corner, meters. */
export function areaReachM(area: MissionArea, from: LatLng): number {
  const halfW = (area.widthKm * 1000) / 2;
  const halfH = (area.heightKm * 1000) / 2;
  return Math.max(...[-1, 1].flatMap((e) => [-1, 1].map((n) => distanceM(from, offsetLatLng(area.center, e * halfW, n * halfH)))));
}

/**
 * The echelon bands squeezed into a smaller zone: every band keeps its order, and the deepest one reaches
 * as far as the zone does. A zone big enough for every band keeps them as they are.
 */
export function echelonBandsFor(reachM: number): Record<UnitKind, [number, number]> {
  const share = Math.max(0, Math.min(1, (reachM - ENEMY_MIN_DISTANCE_M) / (ECHELON_REACH_M - ENEMY_MIN_DISTANCE_M)));
  const scale = (m: number) => ENEMY_MIN_DISTANCE_M + (m - ENEMY_MIN_DISTANCE_M) * share;
  return Object.fromEntries(Object.entries(ENEMY_ECHELONS).map(([kind, [lo, hi]]) => [kind, [scale(lo), scale(hi)]])) as Record<UnitKind, [number, number]>;
}

/** Points the placement samples around the start points: a grid over the widest band plus the spread. */
export function placementPoints(starts: LatLng[], stepM = 2000): LatLng[] {
  const middle = centroid(starts);
  const spread = Math.max(...starts.map((start) => distanceM(middle, start)));
  const reach = Math.max(...Object.values(ENEMY_ECHELONS).map((band) => band[1]), ...ALLY_GROUPS.map((group) => group.band[1])) + spread;
  const points: LatLng[] = [];
  for (let east = -reach; east <= reach; east += stepM) {
    for (let north = -reach; north <= reach; north += stepM) points.push(offsetLatLng(middle, east, north));
  }
  return points;
}

/** Deepest echelon band of the enemy, meters: the reach a mission needs for every kind. */
export const ECHELON_REACH_M = 24000;

/** Distance band from the nearest start point, meters, by kind of enemy unit. */
export const ENEMY_ECHELONS: Record<UnitKind, [number, number]> = {
  infantry: [ENEMY_MIN_DISTANCE_M, 7000],
  position: [ENEMY_MIN_DISTANCE_M, 7000],
  vehicle: [5000, 11000],
  artillery: [10000, 18000],
  air_defense: [14000, 24000],
  ew: [14000, 24000],
  radar: [14000, 24000],
};

/** How many of each kind of enemy unit a mission tries to place (fewer where the area is too small). */
export const ENEMY_COUNTS: Record<UnitKind, number> = { infantry: 6, position: 4, vehicle: 5, artillery: 3, air_defense: 2, ew: 2, radar: 1 };

/** Allied units: how many, how far from the nearest start point, and whether forward (toward the enemy) or behind. */
export const ALLY_GROUPS: { kind: UnitKind; count: number; band: [number, number]; forward: boolean }[] = [
  { kind: 'infantry', count: 3, band: [500, 2500], forward: true },
  { kind: 'vehicle', count: 1, band: [500, 2500], forward: true },
  { kind: 'artillery', count: 1, band: [1000, 4000], forward: false },
  { kind: 'air_defense', count: 1, band: [1000, 4000], forward: false },
];

/** Kinds that can move, and the share of them that do (the rest stand where they were placed). */
export const MOBILE_KINDS: readonly UnitKind[] = ['infantry', 'vehicle'];
export const MOVING_SHARE = 0.5;
/** Ground speed of a moving unit by kind, m/s. */
export const SPEED_MS: Partial<Record<UnitKind, number>> = { infantry: 1.5, vehicle: 6 };
/** Share of the enemy known from intelligence before the mission; the rest must be found. */
export const KNOWN_SHARE = 0.3;
/** Half-width of the sector the enemy (or our forward units) lie in, degrees either side of the front. */
export const SECTOR_HALF_DEG = 70;
/** Units keep at least this far apart. */
export const MIN_SPACING_M = 400;
/** A moving vehicle drives to a point at most this far away, then picks the next one. */
export const LEG_MAX_M = 3000;
// Random tries to find a place before a unit is left out.
const ATTEMPTS = 2000;
// Starts closer than this to the area center give no front direction: the enemy can be on any side.
const CENTERED_M = 1000;

export interface ForceUnit {
  id: string;
  side: UnitSide;
  kind: UnitKind;
  /** Where it really is (the dashboard sees it only once it is known). */
  position: LatLng;
  headingDeg: number | null;
  speedMs: number;
  /** Known before the mission starts. */
  intel: boolean;
  /** Distance band from the nearest start point it stays in. */
  band: [number, number];
  /** Where a moving unit drives to next. */
  waypoint: LatLng | null;
}

function distanceM(a: LatLng, b: LatLng): number {
  const { east, north } = toMetersFrom(a, b);
  return Math.hypot(east, north);
}

/** Distance to the closest start point, meters. */
export function nearestStartM(point: LatLng, starts: LatLng[]): number {
  return Math.min(...starts.map((start) => distanceM(start, point)));
}

function centroid(points: LatLng[]): LatLng {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

/** Bearing from our start points toward the enemy, degrees: toward the area center, or random from the center. */
export function frontBearing(area: MissionArea, starts: LatLng[], random: Random): number {
  const middle = centroid(starts);
  return distanceM(middle, area.center) < CENTERED_M ? random() * 360 : bearingTo(middle, area.center);
}

/** A place in the area, in the band from the nearest start point and away from the other units; null if none found. */
function findPlace(
  area: MissionArea,
  starts: LatLng[],
  band: [number, number],
  pick: () => LatLng,
  taken: LatLng[],
  isWater: IsWater,
): LatLng | null {
  for (let i = 0; i < ATTEMPTS; i++) {
    const point = pick();
    const nearest = nearestStartM(point, starts);
    if (nearest < band[0] || nearest > band[1] || !isInsideArea(point, area) || isWater(point)) continue;
    if (taken.some((other) => distanceM(other, point) < MIN_SPACING_M)) continue;
    return point;
  }
  return null;
}

/** A random point in a sector around `from`, between `minM` and `maxM` away. */
function inSector(from: LatLng, bearing: number, halfDeg: number, minM: number, maxM: number, random: Random): LatLng {
  const rad = ((bearing + (random() * 2 - 1) * halfDeg) * Math.PI) / 180;
  const d = minM + random() * (maxM - minM);
  return offsetLatLng(from, d * Math.sin(rad), d * Math.cos(rad));
}

/** Places the enemy and the allies for a mission with these start points. */
export function generateForces(area: MissionArea, starts: LatLng[], random: Random = Math.random, isWater: IsWater = NO_WATER_CHECK): ForceUnit[] {
  const middle = centroid(starts);
  // Start points can be spread out: the sector is sampled far enough out to reach every band from any of them.
  const spread = Math.max(...starts.map((start) => distanceM(middle, start)));
  const front = frontBearing(area, starts, random);
  const bands = echelonBandsFor(areaReachM(area, middle));
  const units: ForceUnit[] = [];
  const taken = () => units.map((unit) => unit.position);

  let enemyNo = 0;
  for (const [kind, count] of Object.entries(ENEMY_COUNTS) as [UnitKind, number][]) {
    const band = bands[kind];
    for (let i = 0; i < count; i++) {
      const position = findPlace(area, starts, band, () => inSector(middle, front, SECTOR_HALF_DEG, Math.max(0, band[0] - spread), band[1] + spread, random), taken(), isWater);
      if (!position) continue;
      const moves = MOBILE_KINDS.includes(kind) && random() < MOVING_SHARE;
      units.push({
        id: `enemy-${++enemyNo}`,
        side: 'enemy',
        kind,
        position,
        headingDeg: moves ? 0 : null,
        speedMs: moves ? SPEED_MS[kind]! : 0,
        intel: random() < KNOWN_SHARE,
        band,
        waypoint: null,
      });
    }
  }

  let allyNo = 0;
  for (const group of ALLY_GROUPS) {
    const bearing = group.forward ? front : front + 180;
    for (let i = 0; i < group.count; i++) {
      const position = findPlace(area, starts, group.band, () => inSector(middle, bearing, SECTOR_HALF_DEG, 0, group.band[1] + spread, random), taken(), isWater);
      if (!position) continue;
      const moves = MOBILE_KINDS.includes(group.kind) && random() < MOVING_SHARE;
      units.push({ id: `ally-${++allyNo}`, side: 'ally', kind: group.kind, position, headingDeg: moves ? 0 : null, speedMs: moves ? SPEED_MS[group.kind]! : 0, intel: true, band: group.band, waypoint: null });
    }
  }
  return units;
}

/**
 * Moves a unit on the move for `dtS` simulated seconds toward its waypoint; at the waypoint it picks the
 * next one, a short leg away within its band (so it never drives across the band toward our start points).
 * Returns true if it moved.
 */
export function moveUnit(unit: ForceUnit, area: MissionArea, starts: LatLng[], dtS: number, random: Random = Math.random, isWater: IsWater = NO_WATER_CHECK): boolean {
  if (unit.speedMs === 0) return false;
  if (!unit.waypoint) {
    unit.waypoint = findPlace(area, starts, unit.band, () => inSector(unit.position, 0, 180, 0, LEG_MAX_M, random), [], isWater);
    if (!unit.waypoint) return false;
  }
  const step = stepToward(unit.position, unit.waypoint, unit.speedMs * dtS);
  // A step onto water is not taken: the unit waits and picks another leg next tick.
  if (isWater(step.position)) {
    unit.waypoint = null;
    return false;
  }
  unit.position = step.position;
  unit.headingDeg = step.heading;
  if (step.arrived) unit.waypoint = null;
  return true;
}
