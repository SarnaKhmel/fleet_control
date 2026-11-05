import { describe, expect, it, vi } from 'vitest';
import { FRONT_LINE_ID, FRONT_SOURCE_ID, syncFrontLine } from './frontLine';
import { FakeMap } from '../test/maplibreMock';

const zones = { type: 'FeatureCollection', features: [] };

describe('syncFrontLine', () => {
  it('adds fill and line layers when enabled with zones', () => {
    const map = new FakeMap({ style: 'x' });
    syncFrontLine(map as never, { enabled: true, zones, theme: 'dark' });
    expect(map.getSource(FRONT_SOURCE_ID)).toBeTruthy();
    expect(map.getLayer(FRONT_LINE_ID)).toBeTruthy();
  });

  it('removes the layers when disabled', () => {
    const map = new FakeMap({ style: 'x' });
    syncFrontLine(map as never, { enabled: true, zones, theme: 'dark' });
    syncFrontLine(map as never, { enabled: false, zones, theme: 'dark' });
    expect(map.getLayer(FRONT_LINE_ID)).toBeUndefined();
    expect(map.getSource(FRONT_SOURCE_ID)).toBeUndefined();
    vi.restoreAllMocks();
  });
});
