import { describe, expect, it } from 'vitest';
import { parseOpenMeteoWind } from './windApi';

describe('parseOpenMeteoWind', () => {
  it('reads speed (m/s) and the direction the wind comes from', () => {
    expect(
      parseOpenMeteoWind({ current: { wind_speed_10m: 3.52, wind_direction_10m: 345 } }),
    ).toEqual({ speedMs: 3.52, fromDeg: 345 });
  });

  it('returns null when the fields are missing', () => {
    expect(parseOpenMeteoWind({})).toBeNull();
    expect(parseOpenMeteoWind({ current: { wind_speed_10m: 'x', wind_direction_10m: 1 } })).toBeNull();
  });
});
