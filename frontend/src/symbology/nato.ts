import ms from 'milsymbol';

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

export function natoSymbol(sidc: string, size = 32) {
  return new ms.Symbol(sidc, { size });
}

/** Symbol as a DOM element, for use as a MapLibre marker. */
export function natoElement(sidc: string, size = 32): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nato-symbol';
  el.innerHTML = natoSymbol(sidc, size).asSVG();
  return el;
}
