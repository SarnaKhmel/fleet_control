import { describe, expect, it } from 'vitest';
import { areaFromCorners, areaRing, isInsideArea, offsetLatLng, toMetersFrom } from './area';

const area = { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 };

describe('isInsideArea', () => {
  it('accepts the center and points within half the size', () => {
    expect(isInsideArea({ lat: 50, lng: 30 }, area)).toBe(true);
    expect(isInsideArea({ lat: 50.8, lng: 30 }, area)).toBe(true); // ~89 km north
  });

  it('rejects points beyond half the size', () => {
    expect(isInsideArea({ lat: 51.0, lng: 30 }, area)).toBe(false); // ~111 km north
  });
});

describe('areaRing', () => {
  it('closes a ring around the center with the requested size', () => {
    const ring = areaRing(area);
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual(ring[0]);
    const east = toMetersFrom(area.center, ring[1]).east;
    const north = toMetersFrom(area.center, ring[2]).north;
    expect(east).toBeCloseTo(100_000, -2);
    expect(north).toBeCloseTo(100_000, -2);
  });

  it('offsetLatLng is the inverse of toMetersFrom', () => {
    const p = offsetLatLng(area.center, 12_000, -7_000);
    const m = toMetersFrom(area.center, p);
    expect(m.east).toBeCloseTo(12_000, -1);
    expect(m.north).toBeCloseTo(-7_000, -1);
  });
});

describe('areaFromCorners', () => {
  it('builds the zone between two opposite corners', () => {
    const z = areaFromCorners({ lat: 50, lng: 30 }, offsetLatLng({ lat: 50, lng: 30 }, 40_000, 20_000), 500);
    expect(z.widthKm).toBeCloseTo(40, 0);
    expect(z.heightKm).toBeCloseTo(20, 0);
    const mid = toMetersFrom({ lat: 50, lng: 30 }, z.center);
    expect(mid.east).toBeCloseTo(20_000, -1);
    expect(mid.north).toBeCloseTo(10_000, -1);
  });

  it('clamps the size to the allowed range', () => {
    const z = areaFromCorners({ lat: 50, lng: 30 }, offsetLatLng({ lat: 50, lng: 30 }, 900_000, 0.2), 500);
    expect(z.widthKm).toBe(500);
    expect(z.heightKm).toBe(1);
  });
});
