import { describe, expect, it } from 'vitest';
import { mapStyleFor, mapStyleKey, MAP_STYLE_URLS, SATELLITE_STYLE } from './mapStyles';

describe('mapStyleFor', () => {
  it('follows the theme in auto mode', () => {
    expect(mapStyleFor('dark')).toBe(MAP_STYLE_URLS.dark);
    expect(mapStyleFor('light')).toBe(MAP_STYLE_URLS.light);
  });

  it('uses the landscape style regardless of theme', () => {
    expect(mapStyleFor('dark', 'landscape')).toBe(MAP_STYLE_URLS.landscape);
    expect(mapStyleFor('light', 'landscape')).toBe(MAP_STYLE_URLS.landscape);
  });

  it('shows satellite imagery under the same vector source, so the 3D buildings still draw', () => {
    expect(mapStyleFor('dark', 'satellite')).toBe(SATELLITE_STYLE);
    expect(SATELLITE_STYLE.sources.satellite).toMatchObject({ type: 'raster' });
    expect(SATELLITE_STYLE.sources.openmaptiles).toMatchObject({ type: 'vector' });
    expect(SATELLITE_STYLE.layers[0]).toMatchObject({ type: 'raster', source: 'satellite' });
  });
});

describe('mapStyleKey', () => {
  it('changes with the basemap only: each theme in auto, and each view otherwise', () => {
    expect(mapStyleKey('dark')).toBe('dark');
    expect(mapStyleKey('light', 'auto')).toBe('light');
    expect(mapStyleKey('dark', 'landscape')).toBe('landscape');
    expect(mapStyleKey('light', 'satellite')).toBe('satellite');
  });
});
