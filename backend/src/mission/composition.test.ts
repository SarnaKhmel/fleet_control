import { describe, expect, it } from 'vitest';
import { isComposition, MAX_UNITS_PER_KIND } from '../../../shared/mission/composition.js';

const at = { lat: 50, lng: 30 };

describe('mission composition', () => {
  it('accepts counts per kind, and units placed by hand', () => {
    expect(isComposition({})).toBe(true);
    expect(isComposition({ enemy: { vehicle: 5 }, ally: { infantry: 0 } })).toBe(true);
    expect(isComposition({ placed: [{ side: 'enemy', kind: 'radar', position: at }] })).toBe(true);
  });

  it('refuses unknown kinds, counts that are not whole or too big, and bad placements', () => {
    expect(isComposition({ enemy: { tank: 2 } })).toBe(false);
    expect(isComposition({ enemy: { vehicle: 2.5 } })).toBe(false);
    expect(isComposition({ enemy: { vehicle: -1 } })).toBe(false);
    expect(isComposition({ enemy: { vehicle: MAX_UNITS_PER_KIND + 1 } })).toBe(false);
    expect(isComposition({ placed: [{ side: 'neutral', kind: 'vehicle', position: at }] })).toBe(false);
    expect(isComposition({ placed: [{ side: 'enemy', kind: 'vehicle', position: { lat: 91, lng: 0 } }] })).toBe(false);
    expect(isComposition(null)).toBe(false);
  });

  it('refuses more units placed by hand than the count of their kind', () => {
    const one = { side: 'enemy' as const, kind: 'vehicle' as const, position: at };
    expect(isComposition({ enemy: { vehicle: 1 }, placed: [one, one] })).toBe(false);
    expect(isComposition({ enemy: { vehicle: 2 }, placed: [one, one] })).toBe(true);
    // A kind with no count given takes any number placed.
    expect(isComposition({ placed: [one, one] })).toBe(true);
  });
});
