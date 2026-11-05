import { describe, expect, it, vi } from 'vitest';
import { toMetersFrom } from '../../../shared/mission/area';
import { FakeMap } from '../test/maplibreMock';
import { addReconLayer, reconFeatures, syncRecon, RECON_COLORS, RECON_FILL_ID, RECON_SOURCE_ID } from './reconLayer';

const grid = { origin: { lat: 50, lng: 30 }, cellM: 100 };

describe('recon layer', () => {
  it('draws a row of neighbouring cells as one rectangle', () => {
    const { features } = reconFeatures(grid, [[0, 0], [1, 0], [2, 0], [0, 1]]);
    expect(features).toHaveLength(2);
    const corners = features[0].geometry.coordinates[0].map(([lng, lat]) => toMetersFrom(grid.origin, { lat, lng }));
    expect(corners.map(({ east, north }) => [Math.round(east), Math.round(north)])).toEqual([[0, 0], [300, 0], [300, 100], [0, 100], [0, 0]]);
  });

  it('draws nothing before the server sends a grid', () => {
    expect(reconFeatures(null, [[0, 0]]).features).toEqual([]);
  });

  it('adds its source and fill once, fills them and follows the theme', () => {
    const map = new FakeMap({ style: 'x' });
    syncRecon(map as never, grid, [[0, 0]], 'dark');
    expect(map.getSource(RECON_SOURCE_ID)).toBeUndefined();
    addReconLayer(map as never, 'dark');
    addReconLayer(map as never, 'dark');
    expect(map.getLayer(RECON_FILL_ID)).toBeTruthy();
    const paint = vi.spyOn(map, 'setPaintProperty');
    syncRecon(map as never, grid, [[0, 0], [5, 5]], 'light');
    expect((map.getSource(RECON_SOURCE_ID) as unknown as { data: { features: unknown[] } }).data.features).toHaveLength(2);
    expect(paint).toHaveBeenCalledWith(RECON_FILL_ID, 'fill-color', RECON_COLORS.light);
  });
});
