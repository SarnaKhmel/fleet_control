import type { LatLng } from '../location/locationStore';
import type { Wind } from '../../../shared/flight/wind';

// Current wind from Open-Meteo (free, no API key). Its wind_direction_10m is the direction
// the wind blows FROM, the same convention as shared/flight/wind.ts.
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export function parseOpenMeteoWind(json: unknown): Wind | null {
  const current = (json as { current?: { wind_speed_10m?: unknown; wind_direction_10m?: unknown } })?.current;
  const speedMs = Number(current?.wind_speed_10m);
  const fromDeg = Number(current?.wind_direction_10m);
  if (!Number.isFinite(speedMs) || !Number.isFinite(fromDeg)) return null;
  return { speedMs, fromDeg };
}

export async function fetchWindAt(point: LatLng): Promise<Wind> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lng),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Wind request failed: ${response.status}`);
  const wind = parseOpenMeteoWind(await response.json());
  if (!wind) throw new Error('Wind data missing');
  return wind;
}
