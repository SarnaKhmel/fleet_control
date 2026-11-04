import { describe, expect, it } from 'vitest';
import { mapStyleFor, MAP_STYLE_URLS } from './mapStyles';

describe('mapStyleFor', () => {
  it('follows the theme in auto mode', () => {
    expect(mapStyleFor('dark')).toBe(MAP_STYLE_URLS.dark);
    expect(mapStyleFor('light')).toBe(MAP_STYLE_URLS.light);
  });

  it('uses the landscape style regardless of theme', () => {
    expect(mapStyleFor('dark', 'landscape')).toBe(MAP_STYLE_URLS.landscape);
    expect(mapStyleFor('light', 'landscape')).toBe(MAP_STYLE_URLS.landscape);
  });
});
