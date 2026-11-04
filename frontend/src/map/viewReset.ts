// The map registers how to return to the default view; the button calls it.
let resetter: (() => void) | null = null;

export function registerViewReset(fn: (() => void) | null): void {
  resetter = fn;
}

export function resetMapView(): void {
  resetter?.();
}
