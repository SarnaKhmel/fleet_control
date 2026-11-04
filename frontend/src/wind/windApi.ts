import type { LatLng } from '../location/locationStore';
import type { Wind } from '../../../shared/flight/wind';

// Current weather from Open-Meteo (free, no API key). wind_direction_10m is the direction
// the wind blows FROM, the same convention as shared/flight/wind.ts.
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export interface Weather {
  wind: Wind;
  temperatureC: number | null;
  humidityPct: number | null;
}

interface CurrentFields {
  wind_speed_10m?: unknown;
  wind_direction_10m?: unknown;
  temperature_2m?: unknown;
  relative_humidity_2m?: unknown;
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n : null;
}

export function parseOpenMeteoWeather(json: unknown): Weather | null {
  const current = (json as { current?: CurrentFields })?.current;
  const speedMs = finiteOrNull(current?.wind_speed_10m);
  const fromDeg = finiteOrNull(current?.wind_direction_10m);
  if (speedMs === null || fromDeg === null) return null;
  return {
    wind: { speedMs, fromDeg },
    temperatureC: finiteOrNull(current?.temperature_2m),
    humidityPct: finiteOrNull(current?.relative_humidity_2m),
  };
}

export async function fetchWeatherAt(point: LatLng): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lng),
    current: 'wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m',
    wind_speed_unit: 'ms',
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
  const weather = parseOpenMeteoWeather(await response.json());
  if (!weather) throw new Error('Weather data missing');
  return weather;
}
