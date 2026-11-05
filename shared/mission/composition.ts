import { isLatLng, type LatLng } from '../protocol.js';
import { UNIT_KINDS, type UnitKind, type UnitSide } from './units.js';

// The units a mission is played with: how many of each kind per side (the rest are placed at random), and
// the units the operator placed on the map before the start. A placed unit obeys the same placement rules as
// a random one; a placement the rules refuse stops the start.

/** How many units of each kind the enemy has in a mission, unless the operator sets other counts. */
export const DEFAULT_ENEMY_COUNTS: Record<UnitKind, number> = { infantry: 12, position: 8, vehicle: 10, artillery: 6, air_defense: 4, ew: 4, radar: 2 };
/** How many allied units of each kind a mission has, unless the operator sets other counts. */
export const DEFAULT_ALLY_COUNTS: Partial<Record<UnitKind, number>> = { infantry: 6, vehicle: 2, artillery: 2, air_defense: 2 };

/** Most units of one kind a side can have in a mission. */
export const MAX_UNITS_PER_KIND = 50;
/** Most units an operator places by hand in one mission. */
export const MAX_PLACED_UNITS = 200;

export interface PlacedUnit {
  side: UnitSide;
  kind: UnitKind;
  position: LatLng;
}

/** How many units of each kind a side has; a kind left out keeps its default count. */
export type KindCounts = Partial<Record<UnitKind, number>>;

export interface Composition {
  enemy?: KindCounts;
  ally?: KindCounts;
  /** Units placed by hand on the map: they count toward their kind's total. */
  placed?: PlacedUnit[];
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_UNITS_PER_KIND;
}

function isKindCounts(value: unknown): value is KindCounts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([kind, count]) => (UNIT_KINDS as readonly string[]).includes(kind) && isCount(count));
}

function isPlaced(value: unknown): value is PlacedUnit {
  if (typeof value !== 'object' || value === null) return false;
  const unit = value as Partial<PlacedUnit>;
  return (unit.side === 'enemy' || unit.side === 'ally') && (UNIT_KINDS as readonly string[]).includes(unit.kind as string) && isLatLng(unit.position);
}

/**
 * True for a composition the server accepts: known kinds with whole counts, placed units with a side, kind and
 * position, and no more placed units of a kind than its count (when the count is given).
 */
export function isComposition(value: unknown): value is Composition {
  if (typeof value !== 'object' || value === null) return false;
  const composition = value as Composition;
  if (composition.enemy !== undefined && !isKindCounts(composition.enemy)) return false;
  if (composition.ally !== undefined && !isKindCounts(composition.ally)) return false;
  if (composition.placed !== undefined) {
    if (!Array.isArray(composition.placed) || composition.placed.length > MAX_PLACED_UNITS || !composition.placed.every(isPlaced)) return false;
    for (const side of ['enemy', 'ally'] as const) {
      const counts = composition[side];
      if (!counts) continue;
      for (const kind of UNIT_KINDS) {
        const placed = composition.placed.filter((u) => u.side === side && u.kind === kind).length;
        if (counts[kind] !== undefined && placed > counts[kind]) return false;
      }
    }
  }
  return true;
}
