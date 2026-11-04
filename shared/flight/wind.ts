// Flight math shared by the simulator (backend) and the map overlay (frontend).
// Local plane in meters: east/north. Bearings: degrees clockwise from north (0 = N, 90 = E).
// Wind direction uses the meteorological convention: the direction the wind blows FROM.

export interface Wind {
  speedMs: number;
  fromDeg: number;
}

export interface Velocity {
  east: number;
  north: number;
}

export interface WindCorrection {
  /** Nose direction that keeps the ground track. */
  headingDeg: number;
  /** Speed made good along the track. */
  groundSpeedMs: number;
  /** Signed angle from track to heading: negative = nose left of track, positive = right. */
  correctionDeg: number;
  /** False when the wind is too strong to hold this track at this airspeed. */
  feasible: boolean;
}

const DEG = Math.PI / 180;

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed smallest angle from `fromDeg` to `toDeg`, in [-180, 180). */
export function signedAngleDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function bearingToVelocity(bearingDeg: number, speedMs: number): Velocity {
  return {
    east: speedMs * Math.sin(bearingDeg * DEG),
    north: speedMs * Math.cos(bearingDeg * DEG),
  };
}

export function velocityToBearing(velocity: Velocity): number {
  return normalizeDeg(Math.atan2(velocity.east, velocity.north) / DEG);
}

/** Air mass velocity: wind blowing toward the opposite of `fromDeg`. */
export function windVelocity(wind: Wind): Velocity {
  return bearingToVelocity(wind.fromDeg + 180, wind.speedMs);
}

/**
 * Heading that keeps the drone on `trackDeg` given its airspeed and the wind.
 * Solves |groundVelocity - wind| = airspeed for the ground speed along the track.
 */
export function windCorrection(trackDeg: number, airspeedMs: number, wind: Wind): WindCorrection {
  const track = bearingToVelocity(trackDeg, 1);
  const w = windVelocity(wind);
  const alongTrack = track.east * w.east + track.north * w.north;
  const windSquared = w.east * w.east + w.north * w.north;
  const discriminant = alongTrack * alongTrack - (windSquared - airspeedMs * airspeedMs);
  const groundSpeed = alongTrack + Math.sqrt(Math.max(discriminant, 0));

  if (discriminant < 0 || groundSpeed <= 0) {
    return { headingDeg: normalizeDeg(trackDeg), groundSpeedMs: 0, correctionDeg: 0, feasible: false };
  }

  const air = {
    east: groundSpeed * track.east - w.east,
    north: groundSpeed * track.north - w.north,
  };
  const headingDeg = velocityToBearing(air);
  return {
    headingDeg,
    groundSpeedMs: groundSpeed,
    correctionDeg: signedAngleDeg(trackDeg, headingDeg),
    feasible: true,
  };
}

export interface DroneVectors {
  /** Planned direction (route) over `horizonS` seconds. */
  route: Velocity;
  /** Where the nose points over `horizonS` seconds. */
  heading: Velocity;
  /** Where the drone actually goes with this heading (air + wind) over `horizonS` seconds. */
  ground: Velocity;
}

/** Displacement vectors for the map overlay, in meters. */
export function droneVectors(params: {
  trackDeg: number;
  headingDeg: number;
  airspeedMs: number;
  wind: Wind;
  horizonS: number;
}): DroneVectors {
  const { trackDeg, headingDeg, airspeedMs, wind, horizonS } = params;
  const air = bearingToVelocity(headingDeg, airspeedMs);
  const w = windVelocity(wind);
  return {
    route: scale(bearingToVelocity(trackDeg, airspeedMs), horizonS),
    heading: scale(air, horizonS),
    ground: scale({ east: air.east + w.east, north: air.north + w.north }, horizonS),
  };
}

function scale(v: Velocity, k: number): Velocity {
  return { east: v.east * k, north: v.north * k };
}
