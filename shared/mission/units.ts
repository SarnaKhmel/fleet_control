import type { LatLng } from '../protocol.js';

// Units on the ground: the enemy the drones look for and our own forces (allies). The simulator places
// and moves them; the dashboard shows those we know about.

export type UnitSide = 'enemy' | 'ally';

/** Infantry, a dug-in position, vehicles, artillery, air defence, electronic warfare, radar. */
export type UnitKind = 'infantry' | 'position' | 'vehicle' | 'artillery' | 'air_defense' | 'ew' | 'radar';

export const UNIT_KINDS: readonly UnitKind[] = ['infantry', 'position', 'vehicle', 'artillery', 'air_defense', 'ew', 'radar'];

/**
 * How we know about a unit: `intel` before the mission (all allies, some of the enemy), `drone` seen by a
 * drone camera, `ally` seen by an allied unit nearby.
 */
export type UnitSource = 'intel' | 'drone' | 'ally';

export interface MissionUnit {
  /** enemy-1, enemy-2, … and ally-1, ally-2, … */
  id: string;
  side: UnitSide;
  kind: UnitKind;
  /** Where it is, or for an enemy out of sight, where it was last seen. */
  position: LatLng;
  /** Course over the ground, degrees, while it is on the move; null when it stands. */
  headingDeg: number | null;
  /** Ground speed, m/s (0 when it stands). */
  speedMs: number;
  source: UnitSource;
  /** The drone that found it, for source `drone`. */
  detectedByDroneId: string | null;
  /**
   * In sight of one of ours now. Out of sight, the unit stays where it was last seen with the course and speed
   * it had then, and does not move on the map.
   */
  inSight: boolean;
}

/** Radius around an allied unit that it watches: the ground there counts as reconnoitred. */
export const ALLY_RECON_RADIUS_M = 800;
/** No enemy stands or drives closer than this to any drone start point. */
export const ENEMY_MIN_DISTANCE_M = 3000;
