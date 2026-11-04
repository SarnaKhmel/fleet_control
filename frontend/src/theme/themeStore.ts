import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'fleet.theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Dark is the default: it suits a mission-control screen.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
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
