import { describe, expect, it } from 'vitest';
import { parseOpenMeteoWeather } from './windApi';

describe('parseOpenMeteoWeather', () => {
  it('reads wind, temperature and humidity', () => {
    expect(
      parseOpenMeteoWeather({
        current: { wind_speed_10m: 3.52, wind_direction_10m: 345, temperature_2m: 4.5, relative_humidity_2m: 81 },
      }),
    ).toEqual({ wind: { speedMs: 3.52, fromDeg: 345 }, temperatureC: 4.5, humidityPct: 81 });
  });

  it('keeps wind when temperature or humidity is missing', () => {
    expect(parseOpenMeteoWeather({ current: { wind_speed_10m: 2, wind_direction_10m: 90 } })).toEqual({
      wind: { speedMs: 2, fromDeg: 90 },
      temperatureC: null,
      humidityPct: null,
    });
  });

  it('returns null when wind is missing', () => {
    expect(parseOpenMeteoWeather({})).toBeNull();
    expect(parseOpenMeteoWeather({ current: { wind_speed_10m: 'x', wind_direction_10m: 1 } })).toBeNull();
  });
});
