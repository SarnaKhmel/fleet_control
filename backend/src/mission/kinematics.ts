import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { windCorrection } from '../../../shared/flight/wind.js';
import { GROUND_AMSL_M, type LatLng } from '../../../shared/protocol.js';

export { GROUND_AMSL_M };

export const DRONE_SPEED_MS = 10;
export const TICK_MS = 1000;
// Simulated time runs this many times faster than real time, so drones visibly cross the map.
export const SIM_TIME_SCALE = 10;
// Takeoff: drones climb from the ground to a hover altitude, then keep it until they are given a move.
export const HOVER_ALT_M = 60;
export const CLIMB_RATE_MS = 3;
// Simulated battery use: a full charge lasts about 40 minutes of mission time.
export const BATTERY_DRAIN_PER_TICK = 100 / (40 * 60);

// Spacing between drones flying to one target, so they do not stack on the same point.
export const FORMATION_SPACING_M = 150;

/** One step toward a target at most `maxStepM` meters away. */
export function stepToward(from: LatLng, to: LatLng, maxStepM: number): { position: LatLng; heading: number; arrived: boolean } {
  const { east, north } = toMetersFrom(from, to);
  const distance = Math.hypot(east, north);
  const heading = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  if (distance <= maxStepM) return { position: to, heading, arrived: true };
  const k = maxStepM / distance;
  return { position: offsetLatLng(from, east * k, north * k), heading, arrived: false };
}

/** Targets for `count` drones around one point, in a row across the east–west axis. */
export function formationTargets(center: LatLng, count: number): LatLng[] {
  return Array.from({ length: count }, (_, i) => offsetLatLng(center, (i - (count - 1) / 2) * FORMATION_SPACING_M, 0));
}

/** A point `distanceM` meters from `from` along a bearing (degrees clockwise from north). */
export function advanceAlong(from: LatLng, headingDeg: number, distanceM: number): LatLng {
  const rad = (headingDeg * Math.PI) / 180;
  return offsetLatLng(from, distanceM * Math.sin(rad), distanceM * Math.cos(rad));
}

/** Bearing (degrees clockwise from north) from one point to another. */
export function bearingTo(from: LatLng, to: LatLng): number {
  const { east, north } = toMetersFrom(from, to);
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/**
 * One step of flight along a desired ground track in a wind. The nose is turned into the wind by the
 * crab angle that keeps the ground track; the drone then advances by its ground speed. If the wind is too
 * strong to hold the track, the drone flies its nose along the track and is pushed off it.
 */
export function windStep(
  position: LatLng,
  trackDeg: number,
  wind: { speedMs: number; fromDeg: number },
  airspeedMs: number,
  dtS: number,
): { position: LatLng; heading: number; crabDeg: number; groundSpeedMs: number } {
  const corr = windCorrection(trackDeg, airspeedMs, wind);
  if (!corr.feasible) {
    const pushed = advanceAlong(position, trackDeg, airspeedMs * dtS);
    return { position: pushed, heading: trackDeg, crabDeg: 0, groundSpeedMs: airspeedMs };
  }
  return {
    position: advanceAlong(position, trackDeg, corr.groundSpeedMs * dtS),
    heading: corr.headingDeg,
    crabDeg: corr.correctionDeg,
    groundSpeedMs: corr.groundSpeedMs,
  };
}
