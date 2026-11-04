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
