import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// "tactical" is a flat olive-and-steel look (a military HUD style); it shares the dark map basemap.
export type Theme = 'dark' | 'light' | 'tactical';
export const THEME_STORAGE_KEY = 'fleet.theme';
export const THEMES: readonly Theme[] = ['dark', 'light', 'tactical'];

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// Dark is the default: it suits a mission-control screen.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    { name: THEME_STORAGE_KEY },
  ),
);

// CSS tokens in styles/global.css are selected by this attribute.
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));
