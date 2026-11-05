import type { MissionUnit } from '../../../shared/mission/units';
import type { PlacedUnit } from '../../../shared/mission/composition';

/**
 * The units the operator placed by hand, as they will show on the map before the start: each one a known unit
 * of its side, standing still. Keys are placed-1, placed-2, … (they do not clash with the server's ids).
 */
export function placedAsUnits(placed: PlacedUnit[]): Record<string, MissionUnit> {
  return Object.fromEntries(
    placed.map((unit, index) => {
      const id = `placed-${index + 1}`;
      const view: MissionUnit = { id, side: unit.side, kind: unit.kind, position: unit.position, headingDeg: null, speedMs: 0, source: 'intel', detectedByDroneId: null, inSight: true };
      return [id, view];
    }),
  );
}
