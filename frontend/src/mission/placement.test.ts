import { describe, expect, it } from 'vitest';
import { placedAsUnits } from './placement';

describe('placedAsUnits', () => {
  it('shows each hand-placed unit as a known, standing unit of its side, with its own id', () => {
    const units = placedAsUnits([
      { side: 'enemy', kind: 'vehicle', position: { lat: 50.1, lng: 30 } },
      { side: 'ally', kind: 'infantry', position: { lat: 50.2, lng: 30.1 } },
    ]);
    expect(Object.keys(units)).toEqual(['placed-1', 'placed-2']);
    expect(units['placed-2']).toEqual({ id: 'placed-2', side: 'ally', kind: 'infantry', position: { lat: 50.2, lng: 30.1 }, headingDeg: null, speedMs: 0, source: 'intel', detectedByDroneId: null, inSight: true });
  });
});
