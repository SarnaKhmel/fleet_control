import { vi } from 'vitest';
vi.mock('maplibre-gl', () => import('../test/maplibreMock'));
import { describe, expect, it } from 'vitest';
import { missionRing } from './missionLayer';
import { useMissionStore } from './missionStore';

describe('mission area ring', () => {
  it('is a closed rectangle around the default center', () => {
    const ring = missionRing(useMissionStore.getState());
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });
});

describe('zone visibility on the map', () => {
  it('is hidden until the operator chooses it, and shown while the mission runs', async () => {
    const { FakeMap } = await import('../test/maplibreMock');
    const { syncMissionArea, MISSION_LINE_ID } = await import('./missionLayer');
    const map = new FakeMap({ style: 'x' });
    const state = { ...useMissionStore.getState(), phase: 'idle' as const, drawing: false, zoneChosen: false };
    syncMissionArea(map as never, state as never, 'dark');
    expect(map.getLayer(MISSION_LINE_ID)).toBeUndefined();
    syncMissionArea(map as never, { ...state, zoneChosen: true } as never, 'dark');
    expect(map.getLayer(MISSION_LINE_ID)).toBeTruthy();
    syncMissionArea(map as never, { ...state, zoneChosen: false, phase: 'running' } as never, 'dark');
    expect(map.getLayer(MISSION_LINE_ID)).toBeTruthy();
  });
});
