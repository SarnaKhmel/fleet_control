import type { Theme } from '../theme/themeStore';

// OpenFreeMap styles: free, no API key. Dark matches the dark theme, Positron the light one.
export const MAP_STYLE_URLS: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

export const DEFAULT_CENTER = { lat: 50.4501, lng: 30.5234 }; // Kyiv
export const DEFAULT_ZOOM = 10;

export function mapStyleFor(theme: Theme): string {
  return MAP_STYLE_URLS[theme];
}
