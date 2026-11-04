import { beforeEach, describe, expect, it } from 'vitest';
import { dronesInScreenBox, useSelectionStore } from './selection';

describe('drone selection', () => {
  beforeEach(() => useSelectionStore.getState().clear());

  it('toggles one drone with Shift+click', () => {
    useSelectionStore.getState().toggle('drone-1');
    useSelectionStore.getState().toggle('drone-2');
    useSelectionStore.getState().toggle('drone-1');
    expect(useSelectionStore.getState().selectedIds).toEqual(['drone-2']);
  });

  it('selects every drone inside a Shift+drag box, corners in any order', () => {
    const positions = { 'drone-1': { x: 100, y: 100 }, 'drone-2': { x: 300, y: 200 }, 'drone-3': { x: 500, y: 500 } };
    expect(dronesInScreenBox(positions, { x: 250, y: 260 }, { x: 50, y: 50 })).toEqual(['drone-1']);
    expect(dronesInScreenBox(positions, { x: 50, y: 50 }, { x: 400, y: 300 })).toEqual(['drone-1', 'drone-2']);
  });
});
