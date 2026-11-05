import { describe, expect, it } from 'vitest';
import { DEFAULT_ODDS, isMissionOdds } from '../../../shared/mission/odds.js';

describe('mission odds', () => {
  it('starts from the odds the simulator has always used', () => {
    expect(DEFAULT_ODDS).toEqual({
      vehicle: { destroyed: 0.4, damaged: 0.5 },
      infantry: { destroyed: 0.3, damaged: 0.4 },
      infantryShootsDown: 0.2,
      movingShare: 0.5,
      knownShare: 0.3,
    });
    expect(isMissionOdds(DEFAULT_ODDS)).toBe(true);
  });

  it('refuses shares outside 0..1, non-numbers, and strikes whose results add up to more than 1', () => {
    const valid = structuredClone(DEFAULT_ODDS);
    expect(isMissionOdds({ ...valid, knownShare: 1.2 })).toBe(false);
    expect(isMissionOdds({ ...valid, movingShare: -0.1 })).toBe(false);
    expect(isMissionOdds({ ...valid, infantryShootsDown: 'a' })).toBe(false);
    expect(isMissionOdds({ ...valid, infantryShootsDown: Number.NaN })).toBe(false);
    expect(isMissionOdds({ ...valid, vehicle: { destroyed: 0.7, damaged: 0.4 } })).toBe(false);
    expect(isMissionOdds({ ...valid, vehicle: { destroyed: 0.6, damaged: 0.4 } })).toBe(true);
    expect(isMissionOdds(null)).toBe(false);
    expect(isMissionOdds({ vehicle: DEFAULT_ODDS.vehicle })).toBe(false);
  });
});
