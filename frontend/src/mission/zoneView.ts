import type { LatLng } from '../../../shared/protocol';
import { areaRing } from '../../../shared/mission/area';

export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Bounding box of a zone ring. */
export function boxOf(ring: LatLng[]): Box {
  const lngs = ring.map((p) => p.lng);
  const lats = ring.map((p) => p.lat);
  return { west: Math.min(...lngs), east: Math.max(...lngs), south: Math.min(...lats), north: Math.max(...lats) };
}

export function zoneBoxOf(center: LatLng, widthKm: number, heightKm: number): Box {
  return boxOf(areaRing({ center, widthKm, heightKm }));
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;
}

// The map registers how to fit the zone on screen; the button calls it.
let fitter: (() => void) | null = null;

export function registerZoneFitter(fn: (() => void) | null): void {
  fitter = fn;
}

export function fitMissionZone(): void {
  fitter?.();
}
