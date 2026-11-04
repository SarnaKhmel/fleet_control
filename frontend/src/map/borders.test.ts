import { describe, expect, it } from 'vitest';
import { BORDERS_LAYER_ID, bordersLayerSpec } from './borders';

describe('bordersLayerSpec', () => {
  it('draws land country borders from the OpenFreeMap boundary layer', () => {
    const spec = bordersLayerSpec('dark');
    expect(spec).toMatchObject({ id: BORDERS_LAYER_ID, type: 'line', source: 'openmaptiles', 'source-layer': 'boundary' });
    expect((spec as { filter?: unknown }).filter).toEqual(['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]]);
  });

  it('uses a theme color', () => {
    expect(bordersLayerSpec('light').paint).toMatchObject({ 'line-color': '#b45309' });
  });
});
