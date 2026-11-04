import type { LatLng } from './locationStore';

/** Parses "lat, lng" (separated by comma, semicolon or spaces). Returns null if invalid. */
export function parseLatLng(input: string): LatLng | null {
  const parts = input.trim().split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const [lat, lng] = parts.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
