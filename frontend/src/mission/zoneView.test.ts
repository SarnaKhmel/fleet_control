import { describe, expect, it } from 'vitest';
import { boxesOverlap, zoneBoxOf } from './zoneView';

const center = { lat: 50, lng: 30 };

describe('zone visibility', () => {
  it('a box around the zone center overlaps the zone', () => {
    const zone = zoneBoxOf(center, 200, 200);
    expect(boxesOverlap(zone, { west: 29.9, east: 30.1, south: 49.9, north: 50.1 })).toBe(true);
  });

  it('a view far from the zone does not overlap it', () => {
    const zone = zoneBoxOf(center, 200, 200);
    expect(boxesOverlap(zone, { west: 40, east: 41, south: 50, north: 51 })).toBe(false);
  });
});
