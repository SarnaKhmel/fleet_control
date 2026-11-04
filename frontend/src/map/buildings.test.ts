import { describe, expect, it } from 'vitest';
import { BUILDINGS_LAYER_ID, buildingsLayerSpec } from './buildings';

describe('buildingsLayerSpec', () => {
  it('extrudes OpenFreeMap building footprints with their tile heights', () => {
    const spec = buildingsLayerSpec('dark');
    expect(spec.id).toBe(BUILDINGS_LAYER_ID);
    expect(spec).toMatchObject({
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
    });
    expect(spec.paint).toMatchObject({
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-base': ['get', 'render_min_height'],
    });
  });

  it('uses a theme color', () => {
    expect(buildingsLayerSpec('dark').paint).toMatchObject({ 'fill-extrusion-color': '#4a5a78' });
    expect(buildingsLayerSpec('light').paint).toMatchObject({ 'fill-extrusion-color': '#cfc9bf' });
  });
});
