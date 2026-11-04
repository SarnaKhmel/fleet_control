import { describe, expect, it, beforeEach } from 'vitest';
import { applyTheme, THEME_STORAGE_KEY, useThemeStore } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' });
  });

  it('defaults to dark', () => {
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggles between dark and light', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('persists the choice in localStorage', () => {
    useThemeStore.getState().setTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toContain('"light"');
  });

  it('applyTheme sets the data-theme attribute on the root element', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
