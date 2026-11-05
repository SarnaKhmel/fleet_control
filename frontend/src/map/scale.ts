// Scale bar math for Web Mercator tiles (512 px, the MapLibre convention).
const EARTH_CIRCUMFERENCE_M = 40075016.686;

/** Ground meters covered by one screen pixel at a latitude and zoom, measured at the map center. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Largest "nice" length (1, 2, 5 × 10^n meters) that fits in `maxPx` pixels. */
export function niceScale(metersPerPx: number, maxPx = 120): { meters: number; px: number; label: string } {
  const raw = metersPerPx * maxPx;
  const base = 10 ** Math.floor(Math.log10(raw));
  let meters = base;
  for (const factor of [1, 2, 5, 10]) {
    if (factor * base <= raw) meters = factor * base;
  }
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
  return { meters, px: meters / metersPerPx, label };
}
