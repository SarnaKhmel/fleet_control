// The odds a mission is played with: what a strike does, how often infantry shoots a drone down, and how the
// units are placed. The operator sets them before a mission starts; the server checks them at the boundary.

/** Outcome shares of a strike that reaches its unit: destroyed, damaged; the rest is unharmed. */
export interface StrikeOdds {
  destroyed: number;
  damaged: number;
}

export interface MissionOdds {
  /** Strike results on vehicles. */
  vehicle: StrikeOdds;
  /** Strike results on infantry and positions, among the strikes they do not shoot down. */
  infantry: StrikeOdds;
  /** Chance infantry or a position shoots the drone down before it strikes. */
  infantryShootsDown: number;
  /** Share of the mobile units (infantry and vehicles) that are on the move at the start. */
  movingShare: number;
  /** Share of the enemy known from intelligence at the start. */
  knownShare: number;
}

/** The odds a mission uses unless the operator sets others. */
export const DEFAULT_ODDS: MissionOdds = {
  vehicle: { destroyed: 0.4, damaged: 0.5 },
  infantry: { destroyed: 0.3, damaged: 0.4 },
  infantryShootsDown: 0.2,
  movingShare: 0.5,
  knownShare: 0.3,
};

function isShare(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isStrikeOdds(value: unknown): value is StrikeOdds {
  if (typeof value !== 'object' || value === null) return false;
  const { destroyed, damaged } = value as Partial<StrikeOdds>;
  return isShare(destroyed) && isShare(damaged) && destroyed + damaged <= 1;
}

/** True for a complete set of odds with every share in 0..1 and each strike's shares adding up to at most 1. */
export function isMissionOdds(value: unknown): value is MissionOdds {
  if (typeof value !== 'object' || value === null) return false;
  const odds = value as Partial<MissionOdds>;
  return (
    isStrikeOdds(odds.vehicle) &&
    isStrikeOdds(odds.infantry) &&
    isShare(odds.infantryShootsDown) &&
    isShare(odds.movingShare) &&
    isShare(odds.knownShare)
  );
}
