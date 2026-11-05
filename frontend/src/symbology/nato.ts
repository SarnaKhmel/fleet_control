import ms from 'milsymbol';
import type { UnitKind, UnitSide } from '../../../shared/mission/units';

// NATO APP-6 / MIL-STD-2525 symbols, generated from SIDC codes by milsymbol.
// Letter SIDC layout: S <affiliation> <dimension> <status> <function...>.

export type TargetStatus = 'detected' | 'confirmed' | 'engaged' | 'neutralized';

// Own unmanned air vehicle: friendly, air, present, UAV function.
export const DRONE_SIDC = 'SFAPMFQ-----------';

// Ground target by status. Unknown while detected, hostile once confirmed or engaged,
// destroyed ('X') when neutralized.
export function targetSidc(status: TargetStatus): string {
  switch (status) {
    case 'detected':
      return 'SUGPUCI-----------';
    case 'confirmed':
    case 'engaged':
      return 'SHGPUCI-----------';
    case 'neutralized':
      return 'SHGXUCI-----------';
  }
}

// Generic control point (tactical graphic: dot between two bars), APP-6 family GGGPGPC.
export const CONTROL_POINT_SIDC = 'GGGPGPC-----';

// Ground unit function codes (MIL-STD-2525C), and a modifier for a unit dug in at a position
// (installation). EW is "signals intelligence / electronic warfare"; radar is ground sensor equipment.
const UNIT_FUNCTION: Record<UnitKind, string> = {
  infantry: 'UCI---',
  position: 'UCI---',
  vehicle: 'UCA---',
  artillery: 'UCF---',
  air_defense: 'UCD---',
  ew: 'UUMSE-',
  radar: 'ESR---',
  // A depot is supply; a base is a fixed installation. Both are dug in: the modifier in unitSidc marks them so.
  depot: 'USS---',
  base: 'IBA---',
};

/** Ground unit: hostile for the enemy, friendly for allies. */
export function unitSidc(side: UnitSide, kind: UnitKind): string {
  const affiliation = side === 'enemy' ? 'H' : 'F';
  const modifier = kind === 'position' || kind === 'base' || kind === 'depot' ? 'H-' : '--';
  return `S${affiliation}GP${UNIT_FUNCTION[kind]}${modifier}---`;
}

/** `direction`: the direction-of-movement arrow, degrees, for a unit on the move. */
export function natoSymbol(sidc: string, size = 32, direction?: number) {
  return new ms.Symbol(sidc, direction === undefined ? { size } : { size, direction });
}

/** Symbol as a DOM element, for use as a MapLibre marker. */
export function natoElement(sidc: string, size = 32, direction?: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nato-symbol';
  el.innerHTML = natoSymbol(sidc, size, direction).asSVG();
  return el;
}

/**
 * Visual cue on top of the symbol. NATO has no standard "engaged" status, so an engaged
 * hostile target gets an orange frame; confirmed stays a plain hostile symbol.
 */
export function targetHighlight(status: TargetStatus): 'engaged' | null {
  return status === 'engaged' ? 'engaged' : null;
}
