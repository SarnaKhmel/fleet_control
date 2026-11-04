// Collision prediction shared by the simulator and the map overlay.
// Tracks are in a local frame (meters) with constant velocity over the horizon.
// Two objects conflict when, at the same moment, their horizontal distance and
// their vertical distance are both below the limits.

export interface Track3D {
  east: number;
  north: number;
  /** Altitude above the local origin, meters (e.g. AMSL minus the origin's AMSL). */
  up: number;
  vEast: number;
  vNorth: number;
  vUp: number;
}

export interface ConflictLimits {
  horizontalM: number;
  verticalM: number;
}

/** Project defaults: 20 m horizontal, 20 m vertical, 60 s horizon. */
export const DEFAULT_CONFLICT_LIMITS: ConflictLimits = { horizontalM: 20, verticalM: 20 };
export const DEFAULT_HORIZON_S = 60;

/** Static obstacle (tower, building, mast): a vertical cylinder from the ground up to `topUp`. */
export interface Obstacle {
  east: number;
  north: number;
  radiusM: number;
  /** Top of the obstacle, meters in the local frame. */
  topUp: number;
}

export interface ConflictResult {
  conflict: boolean;
  /** Earliest time within the horizon when both limits are violated, or null. */
  firstConflictS: number | null;
  /** Smallest horizontal distance within the horizon. */
  minHorizontalM: number;
}

/** Samples the horizon every `stepS` seconds. Simple and exact enough for a few tracks. */
export function predictConflict(
  a: Track3D,
  b: Track3D,
  limits: ConflictLimits,
  horizonS = 60,
  stepS = 1,
): ConflictResult {
  let minHorizontalM = Infinity;
  let firstConflictS: number | null = null;
  const steps = Math.floor(horizonS / stepS);

  for (let i = 0; i <= steps; i++) {
    const t = i * stepS;
    const dEast = b.east + b.vEast * t - (a.east + a.vEast * t);
    const dNorth = b.north + b.vNorth * t - (a.north + a.vNorth * t);
    const dUp = b.up + b.vUp * t - (a.up + a.vUp * t);
    const horizontal = Math.hypot(dEast, dNorth);

    minHorizontalM = Math.min(minHorizontalM, horizontal);
    if (firstConflictS === null && horizontal < limits.horizontalM && Math.abs(dUp) < limits.verticalM) {
      firstConflictS = t;
    }
  }

  return { conflict: firstConflictS !== null, firstConflictS, minHorizontalM };
}

/** Converts lat/lng/altitude to the local frame around `origin` (equirectangular, fine for a few km). */
export function toLocal(
  origin: { lat: number; lng: number; altM: number },
  point: { lat: number; lng: number; altM: number },
): { east: number; north: number; up: number } {
  const metersPerDegLat = 110_574;
  const metersPerDegLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    east: (point.lng - origin.lng) * metersPerDegLng,
    north: (point.lat - origin.lat) * metersPerDegLat,
    up: point.altM - origin.altM,
  };
}

/**
 * Drone vs. static obstacle. Conflict when the drone is within `horizontalM` of the
 * obstacle's footprint and below its top plus `verticalM` (flying above with margin is safe).
 */
export function predictObstacleConflict(
  drone: Track3D,
  obstacle: Obstacle,
  limits: ConflictLimits = DEFAULT_CONFLICT_LIMITS,
  horizonS = DEFAULT_HORIZON_S,
  stepS = 1,
): ConflictResult {
  let minHorizontalM = Infinity;
  let firstConflictS: number | null = null;
  const steps = Math.floor(horizonS / stepS);

  for (let i = 0; i <= steps; i++) {
    const t = i * stepS;
    const east = drone.east + drone.vEast * t - obstacle.east;
    const north = drone.north + drone.vNorth * t - obstacle.north;
    const up = drone.up + drone.vUp * t;
    const gap = Math.hypot(east, north) - obstacle.radiusM;

    minHorizontalM = Math.min(minHorizontalM, gap);
    if (firstConflictS === null && gap < limits.horizontalM && up < obstacle.topUp + limits.verticalM) {
      firstConflictS = t;
    }
  }

  return { conflict: firstConflictS !== null, firstConflictS, minHorizontalM };
}
