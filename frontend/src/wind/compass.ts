export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const POINTS: CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Nearest of the eight compass points for a bearing in degrees. */
export function compassPoint(deg: number): CompassPoint {
  const normalized = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(normalized / 45) % 8];
}
