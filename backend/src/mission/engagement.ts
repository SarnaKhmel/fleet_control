import type { LatLng } from '../../../shared/protocol.js';
import { toMetersFrom } from '../../../shared/mission/area.js';
import type { Buildings } from '../buildings/buildings.js';
import { advanceAlong } from './kinematics.js';
import { DUG_IN_KINDS, type HitOutcome, type UnitKind } from '../../../shared/mission/units.js';
import type { MissionOdds } from '../../../shared/mission/odds.js';
import { buildingAhead } from './obstacles.js';

// Engagement of an enemy unit: `strike` flies at the unit until it hits it; `pursuit` keeps the drone
// between PURSUIT_MIN_M and PURSUIT_MAX_M from the unit: behind it while it moves, circling it while it
// stands. The drone's controller runs the flight; this module holds the geometry.

/** Pursuit keeps the drone between these distances from the unit, meters. */
export const PURSUIT_MIN_M = 200;
export const PURSUIT_MAX_M = 400;
/** Simulated seconds of one in-and-out swing of the distance (between the two limits). */
export const PURSUIT_RANGE_PERIOD_S = 150;
/** A standing unit: simulated seconds for the drone to fly one full circle around it. */
export const PURSUIT_ORBIT_PERIOD_S = 300;
/** Around a building in the way, the drone turns aside in steps of this many degrees, up to the limit. */
export const DETOUR_STEP_DEG = 15;
export const DETOUR_MAX_DEG = 150;

/** Distance, meters, between two points. */
export function distanceM(a: LatLng, b: LatLng): number {
  const { east, north } = toMetersFrom(a, b);
  return Math.hypot(east, north);
}

/** The distance a pursuing drone keeps from its unit at a moment, meters: it swings between the two limits. */
export function pursuitRangeM(clockS: number): number {
  const middle = (PURSUIT_MIN_M + PURSUIT_MAX_M) / 2;
  const half = (PURSUIT_MAX_M - PURSUIT_MIN_M) / 2;
  return middle + half * Math.sin((2 * Math.PI * clockS) / PURSUIT_RANGE_PERIOD_S);
}

/**
 * The point a pursuing drone flies to, at its range from the unit. A moving unit: the drone settles behind
 * it, on the bearing opposite its course, and follows as it turns. A standing unit: the drone circles it,
 * from the bearing `sideDeg` it came in on, one full circle per PURSUIT_ORBIT_PERIOD_S.
 */
export function pursuitPost(unit: { position: LatLng; headingDeg: number | null; speedMs: number }, sideDeg: number, clockS: number): LatLng {
  const bearingDeg =
    unit.speedMs > 0 && unit.headingDeg !== null
      ? unit.headingDeg + 180
      : sideDeg + (360 * clockS) / PURSUIT_ORBIT_PERIOD_S;
  return advanceAlong(unit.position, bearingDeg, pursuitRangeM(clockS));
}

/**
 * The track to fly for the next `lookM` meters: `wantDeg` if no building above `aglM` is in the way,
 * otherwise the nearest clear track turned aside from it. Without a clear track, `wantDeg` again.
 */
export function clearTrack(buildings: Buildings, from: LatLng, wantDeg: number, lookM: number, aglM: number): number {
  for (let turn = 0; turn <= DETOUR_MAX_DEG; turn += DETOUR_STEP_DEG) {
    for (const deg of turn === 0 ? [wantDeg] : [wantDeg + turn, wantDeg - turn]) {
      if (!buildingAhead(buildings, [from, advanceAlong(from, deg, lookM)], lookM, aglM)) return deg;
    }
  }
  return wantDeg;
}


/**
 * What a strike on a unit of this kind does. Infantry first shoots at the drone (shotDown); otherwise the
 * strike hits and its outcome is drawn. Positions are held by infantry; other armour is a vehicle.
 */
export function drawStrike(kind: UnitKind, random: () => number, odds: MissionOdds): { outcome: HitOutcome | null; shotDown: boolean } {
  const infantry = DUG_IN_KINDS.includes(kind);
  if (infantry && random() < odds.infantryShootsDown) return { outcome: null, shotDown: true };
  const hit = infantry ? odds.infantry : odds.vehicle;
  const roll = random();
  const outcome: HitOutcome = roll < hit.destroyed ? 'destroyed' : roll < hit.destroyed + hit.damaged ? 'damaged' : 'unharmed';
  return { outcome, shotDown: false };
}
