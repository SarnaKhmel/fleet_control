import { beforeEach, describe, expect, it } from 'vitest';
import { resetEverything } from './resetAll';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';

describe('resetEverything', () => {
  beforeEach(() => {
    useSelectionStore.getState().select(['drone-1']);
    useMissionStore.setState({
      points: [{ lat: 50, lng: 30 }],
      picking: true,
      zoneChosen: true,
      widthKm: 120,
      phase: 'idle',
    });
  });

  it('clears the mission building state and the selection', () => {
    resetEverything();
    const m = useMissionStore.getState();
    expect(m.points).toEqual([]);
    expect(m.picking).toBe(false);
    expect(m.zoneChosen).toBe(false);
    expect(m.widthKm).toBe(50);
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });
});
