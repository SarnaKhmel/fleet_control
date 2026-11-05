// Battery model shared by the simulator (backend) and the range shown on the map (frontend).
// Times are simulated seconds. The power a multirotor needs grows with its airspeed: part of it only
// keeps it up (hovering), the rest goes into drag, which grows with the square of the airspeed.

import { offsetLatLng } from '../mission/area.js';
import type { LatLng } from '../protocol.js';
import { windCorrection, type Wind } from './wind.js';

/** A full charge lasts this long in the air at the reference airspeed: 40 minutes. */
export const FULL_CHARGE_FLIGHT_S = 40 * 60;
export const REFERENCE_AIRSPEED_MS = 10;
/** Share of the power at the reference airspeed that only keeps the drone up (needed even when hovering). */
export const HOVER_POWER_SHARE = 0.6;
/** On the ground the drone powers only its link: this share of the reference flight power. */
export const LINK_POWER_SHARE = 1 / 20;

/** Battery used per second in the air at this airspeed, percent. */
export function airDrainPctPerS(airspeedMs: number): number {
  const ratio = airspeedMs / REFERENCE_AIRSPEED_MS;
  return (100 / FULL_CHARGE_FLIGHT_S) * (HOVER_POWER_SHARE + (1 - HOVER_POWER_SHARE) * ratio * ratio);
}

/** Battery used per second on the ground, percent. */
export function groundDrainPctPerS(): number {
  return (100 / FULL_CHARGE_FLIGHT_S) * LINK_POWER_SHARE;
}

/** Seconds of flight left at this airspeed. */
export function enduranceS(batteryPct: number, airspeedMs: number): number {
  return Math.max(0, batteryPct) / airDrainPctPerS(airspeedMs);
}

/**
 * How far the drone can fly on its remaining charge in each direction, as a closed ring around it.
 * In each direction the ground speed is the airspeed corrected for the wind: a tailwind carries it
 * further, a headwind holds it back, and where the wind is too strong to make headway it gets nowhere.
 */
export function rangeOutline(position: LatLng, batteryPct: number, airspeedMs: number, wind: Wind, steps = 72): LatLng[] {
  const seconds = enduranceS(batteryPct, airspeedMs);
  const ring: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (360 * i) / steps;
    const { groundSpeedMs, feasible } = windCorrection(bearing, airspeedMs, wind);
    const meters = feasible ? groundSpeedMs * seconds : 0;
    const rad = (bearing * Math.PI) / 180;
    ring.push(offsetLatLng(position, meters * Math.sin(rad), meters * Math.cos(rad)));
  }
  return ring;
}
