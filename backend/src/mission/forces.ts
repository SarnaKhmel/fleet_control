import type { LatLng, MissionArea } from '../../../shared/protocol.js';
import { isInsideArea, offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { ENEMY_MIN_DISTANCE_M, SPEED_RANGE_MS, UNIT_KINDS, type UnitKind, type UnitSide } from '../../../shared/mission/units.js';
import { DEFAULT_ALLY_COUNTS, DEFAULT_ENEMY_COUNTS, type Composition, type PlacedUnit } from '../../../shared/mission/composition.js';
import { bearingTo, stepToward } from './kinematics.js';
import { DEFAULT_ODDS, type MissionOdds } from '../../../shared/mission/odds.js';
import { NO_BUILDINGS, type Buildings } from '../buildings/buildings.js';
import { hitOnStep } from './obstacles.js';

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
  depot: [ENEMY_MIN_DISTANCE_M, 7000],
  base: [ENEMY_MIN_DISTANCE_M, 7000],
};

/** Allied bands: how far from the nearest start point each allied kind stands, and whether forward (toward the enemy) or behind. */
export const ALLY_GROUPS: { kind: UnitKind; band: [number, number]; forward: boolean }[] = [
  { kind: 'infantry', band: [500, 2500], forward: true },
  { kind: 'vehicle', band: [500, 2500], forward: true },
  { kind: 'artillery', band: [1000, 4000], forward: false },
  { kind: 'air_defense', band: [1000, 4000], forward: false },
];

/** Kinds that can move, and the share of them that do (the rest stand where they were placed). */
export const MOBILE_KINDS: readonly UnitKind[] = ['infantry', 'vehicle'];
/**
 * A speed for a unit's next leg, m/s: drawn within its range. Vehicles off road for now; on a road they draw
 * from the road range once roads are routed.
 */
export function legSpeedMs(kind: keyof typeof SPEED_RANGE_MS, random: Random): number {
  const [lo, hi] = SPEED_RANGE_MS[kind].offRoad;
  return lo + (hi - lo) * random();
}
/** Half-width of the sector the enemy (or our forward units) lie in, degrees either side of the front. */
export const SECTOR_HALF_DEG = 70;
/** Units keep at least this far apart. */
export const MIN_SPACING_M = 250;
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
  /** Hit by a strike and not destroyed. */
  damaged?: boolean;
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

/**
 * The placement rules, for a unit and for a placed one alike: inside the area, in the band from the nearest start
 * point, not on water, and apart from the other units.
 */
export function fitsPlace(point: LatLng, area: MissionArea, starts: LatLng[], band: [number, number], taken: LatLng[], isWater: IsWater): boolean {
  const nearest = nearestStartM(point, starts);
  if (nearest < band[0] || nearest > band[1] || !isInsideArea(point, area) || isWater(point)) return false;
  return !taken.some((other) => distanceM(other, point) < MIN_SPACING_M);
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
    if (fitsPlace(point, area, starts, band, taken, isWater)) return point;
  }
  return null;
}

/** A placed unit that the placement rules refuse: the mission does not start. */
export class PlacementError extends Error {
  constructor(readonly placed: PlacedUnit) {
    super(`placement refused: ${placed.side} ${placed.kind}`);
  }
}

/** A random point in a sector around `from`, between `minM` and `maxM` away. */
function inSector(from: LatLng, bearing: number, halfDeg: number, minM: number, maxM: number, random: Random): LatLng {
  const rad = ((bearing + (random() * 2 - 1) * halfDeg) * Math.PI) / 180;
  const d = minM + random() * (maxM - minM);
  return offsetLatLng(from, d * Math.sin(rad), d * Math.cos(rad));
}

/** The band and the direction of an allied kind: its group's, or behind the start points when it has none. */
function allyBandOf(kind: UnitKind): { band: [number, number]; forward: boolean } {
  const group = ALLY_GROUPS.find((g) => g.kind === kind);
  return group ? { band: group.band, forward: group.forward } : { band: [1000, 4000], forward: false };
}

/**
 * Places the enemy and the allies for a mission with these start points. The composition sets how many of each
 * kind a side has (the defaults where it does not), and places some units by hand; the rest are placed at random.
 * A placed unit the rules refuse throws PlacementError.
 */
export function generateForces(
  area: MissionArea,
  starts: LatLng[],
  random: Random = Math.random,
  isWater: IsWater = NO_WATER_CHECK,
  odds: MissionOdds = DEFAULT_ODDS,
  composition: Composition = {},
): ForceUnit[] {
  const middle = centroid(starts);
  // Start points can be spread out: the sector is sampled far enough out to reach every band from any of them.
  const spread = Math.max(...starts.map((start) => distanceM(middle, start)));
  const front = frontBearing(area, starts, random);
  const bands = echelonBandsFor(areaReachM(area, middle));
  const units: ForceUnit[] = [];
  const taken = () => units.map((unit) => unit.position);
  const enemyNo = { n: 0 };
  const allyNo = { n: 0 };

  const add = (side: UnitSide, kind: UnitKind, position: LatLng) => {
    const moves = MOBILE_KINDS.includes(kind) && random() < odds.movingShare;
    const id = side === 'enemy' ? `enemy-${++enemyNo.n}` : `ally-${++allyNo.n}`;
    if (side === 'enemy') {
      units.push({ id, side, kind, position, headingDeg: moves ? 0 : null, speedMs: moves ? legSpeedMs(kind as keyof typeof SPEED_RANGE_MS, random) : 0, intel: random() < odds.knownShare, band: bands[kind], waypoint: null });
    } else {
      units.push({ id, side, kind, position, headingDeg: moves ? 0 : null, speedMs: moves ? legSpeedMs(kind as keyof typeof SPEED_RANGE_MS, random) : 0, intel: true, band: allyBandOf(kind).band, waypoint: null });
    }
  };

  // The units placed by hand come first: they must pass the same rules as a random one.
  for (const placed of composition.placed ?? []) {
    const band = placed.side === 'enemy' ? bands[placed.kind] : allyBandOf(placed.kind).band;
    if (!fitsPlace(placed.position, area, starts, band, taken(), isWater)) throw new PlacementError(placed);
    add(placed.side, placed.kind, placed.position);
  }
  const placedOf = (side: UnitSide, kind: UnitKind) => units.filter((u) => u.side === side && u.kind === kind).length;

  for (const kind of UNIT_KINDS) {
    const band = bands[kind];
    const count = composition.enemy?.[kind] ?? DEFAULT_ENEMY_COUNTS[kind];
    for (let i = placedOf('enemy', kind); i < count; i++) {
      const position = findPlace(area, starts, band, () => inSector(middle, front, SECTOR_HALF_DEG, Math.max(0, band[0] - spread), band[1] + spread, random), taken(), isWater);
      if (position) add('enemy', kind, position);
    }
  }

  for (const kind of UNIT_KINDS) {
    const { band, forward } = allyBandOf(kind);
    const bearing = forward ? front : front + 180;
    const count = composition.ally?.[kind] ?? DEFAULT_ALLY_COUNTS[kind] ?? 0;
    for (let i = placedOf('ally', kind); i < count; i++) {
      const position = findPlace(area, starts, band, () => inSector(middle, bearing, SECTOR_HALF_DEG, 0, band[1] + spread, random), taken(), isWater);
      if (position) add('ally', kind, position);
    }
  }
  return units;
}

/**
 * Moves a unit on the move for `dtS` simulated seconds toward its waypoint; at the waypoint it picks the
 * next one, a short leg away within its band (so it never drives across the band toward our start points).
 * Returns true if it moved.
 */
export function moveUnit(
  unit: ForceUnit,
  area: MissionArea,
  starts: LatLng[],
  dtS: number,
  random: Random = Math.random,
  isWater: IsWater = NO_WATER_CHECK,
  buildings: Buildings = NO_BUILDINGS,
): boolean {
  if (unit.speedMs === 0) return false;
  if (!unit.waypoint) {
    unit.waypoint = findPlace(area, starts, unit.band, () => inSector(unit.position, 0, 180, 0, LEG_MAX_M, random), [], isWater);
    if (!unit.waypoint) return false;
    unit.speedMs = legSpeedMs(unit.kind as keyof typeof SPEED_RANGE_MS, random);
  }
  const step = stepToward(unit.position, unit.waypoint, unit.speedMs * dtS);
  // A step onto water, or a vehicle's step into a building, is not taken: the unit waits and picks another leg
  // next tick. Infantry walks into buildings (and holds them: see the controller).
  const blocked = unit.kind === 'vehicle' && hitOnStep(buildings, unit.position, step.position, 0) !== null;
  if (isWater(step.position) || blocked) {
    unit.waypoint = null;
    return false;
  }
  unit.position = step.position;
  unit.headingDeg = step.heading;
  if (step.arrived) unit.waypoint = null;
  return true;
}
