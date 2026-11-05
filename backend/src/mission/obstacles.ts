import type { LatLng } from '../../../shared/protocol.js';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import type { Building, Buildings } from '../buildings/buildings.js';

// Buildings on a drone's path: the one it would hit ahead (for a warning), and the one it flies into
// during a step (a collision). The building a path starts in does not count: a drone that took off from
// a roof or a yard is not flying into it.

/** Real seconds of flight ahead in which a building raises a warning. */
export const WARNING_REAL_S = 20;
/** A building this close below the drone's height already counts as in its way, meters. */
export const CLEARANCE_M = 10;
/** Spacing of the points checked along the path ahead, meters. */
export const PATH_STEP_M = 10;
/** Spacing of the points checked along one step of flight, meters: finer, as this decides a collision. */
export const HIT_STEP_M = 5;

/** Points every `stepM` meters along a path, with their distance from its start, up to `maxM` (end included). */
export function samplePath(path: LatLng[], stepM: number, maxM: number): { point: LatLng; distanceM: number }[] {
  const samples: { point: LatLng; distanceM: number }[] = [];
  let walked = 0;
  for (let i = 1; i < path.length && walked <= maxM; i++) {
    const from = path[i - 1];
    const { east, north } = toMetersFrom(from, path[i]);
    const length = Math.hypot(east, north);
    for (let d = i === 1 ? 0 : stepM - (walked % stepM || stepM); d < length && walked + d <= maxM; d += stepM) {
      samples.push({ point: offsetLatLng(from, (east * d) / length, (north * d) / length), distanceM: walked + d });
    }
    walked += length;
  }
  const end = path.at(-1);
  if (end && walked <= maxM && path.length > 1) samples.push({ point: end, distanceM: walked });
  return samples;
}

/**
 * The first building along the path, within `maxM`, whose top reaches `aglM - clearanceM` (heights
 * above the ground), not counting the one the path starts in; null when the way is clear.
 */
export function buildingAhead(
  buildings: Buildings,
  path: LatLng[],
  maxM: number,
  aglM: number,
  clearanceM = CLEARANCE_M,
  stepM = PATH_STEP_M,
): { point: LatLng; distanceM: number; building: Building } | null {
  if (path.length < 2) return null;
  const startedIn = buildings.at(path[0]);
  for (const sample of samplePath(path, stepM, maxM)) {
    const building = buildings.at(sample.point);
    if (building && building !== startedIn && building.heightM > aglM - clearanceM) return { ...sample, building };
  }
  return null;
}

/** Where a step of flight from `from` to `to` at `aglM` above the ground enters a building taller than that. */
export function hitOnStep(buildings: Buildings, from: LatLng, to: LatLng, aglM: number): LatLng | null {
  return buildingAhead(buildings, [from, to], Infinity, aglM, 0, HIT_STEP_M)?.point ?? null;
}
