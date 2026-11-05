import { describe, expect, it, beforeEach } from 'vitest';
import { applyTheme, THEMES, THEME_STORAGE_KEY, useThemeStore } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' });
  });

  it('defaults to dark', () => {
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('offers dark, light and tactical themes', () => {
    expect(THEMES).toEqual(['dark', 'light', 'tactical']);
  });

  it('switches to the tactical theme and applies it to the document', () => {
    useThemeStore.getState().setTheme('tactical');
    applyTheme(useThemeStore.getState().theme);
    expect(document.documentElement.dataset.theme).toBe('tactical');
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
