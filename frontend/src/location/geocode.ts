import type { LatLng } from './locationStore';

// City search via Nominatim (OpenStreetMap). Usage policy: low volume, one request per
// explicit search, no autocomplete on every keystroke.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Extracts the first result's coordinates from a Nominatim JSON response. */
export function parseNominatim(results: unknown): LatLng | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Returns the coordinates of a place name, or null when nothing matches. Throws on network errors. */
export async function geocodeCity(query: string, language: string): Promise<LatLng | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    'accept-language': language,
  });
  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
  return parseNominatim(await response.json());
}
