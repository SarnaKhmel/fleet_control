import { describe, expect, it } from 'vitest';
import { terrainIssue, useMapIssueStore } from './mapIssue';

const TERRAIN = 'terrain-dem';

describe('terrain issue', () => {
  it('raises the terrain issue when a terrain tile fails, and clears it once terrain loads again', () => {
    expect(terrainIssue(null, { sourceId: TERRAIN, error: new Error('HTTP 503') }, TERRAIN)).toBe('terrain');
    expect(terrainIssue('terrain', { sourceId: TERRAIN, isSourceLoaded: true }, TERRAIN)).toBeNull();
  });

  it('does not raise it for a request the map aborted, nor for other sources', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(terrainIssue(null, { sourceId: TERRAIN, error: aborted }, TERRAIN)).toBeNull();
    expect(terrainIssue('style', { sourceId: 'osm', error: new Error('x') }, TERRAIN)).toBe('style');
  });

  it('keeps a style problem: loaded terrain does not clear it', () => {
    expect(terrainIssue('style', { sourceId: TERRAIN, isSourceLoaded: true }, TERRAIN)).toBe('style');
  });
});

describe('mapIssue store', () => {
  it('starts without issues and records one', () => {
    expect(useMapIssueStore.getState().issue).toBeNull();
    useMapIssueStore.getState().setIssue('terrain');
    expect(useMapIssueStore.getState().issue).toBe('terrain');
    useMapIssueStore.getState().setIssue(null);
  });
});
