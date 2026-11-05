// The map registers how to return to the default view; the button calls it.
let resetter: (() => void) | null = null;

export function registerViewReset(fn: (() => void) | null): void {
  resetter = fn;
}

export function resetMapView(): void {
  resetter?.();
}

// The map registers how to turn north up; the compass calls it.
let northUp: (() => void) | null = null;

export function registerNorthUp(fn: (() => void) | null): void {
  northUp = fn;
}

export function turnNorthUp(): void {
  northUp?.();
}
