import { describe, expect, it } from 'vitest';
import { boxOf, createGridIndex, isInside, type Outline } from './outline.js';

const square = (lat: number, lng: number, size: number): Outline => {
  const rings = [[{ lat, lng }, { lat, lng: lng + size }, { lat: lat + size, lng: lng + size }, { lat: lat + size, lng }, { lat, lng }]];
  return { rings, ...boxOf(rings) };
};

describe('boxOf', () => {
  it('handles an outline with more points than a spread call can take', () => {
    const ring = Array.from({ length: 300_000 }, (_, i) => ({ lat: i, lng: i }));
    expect(boxOf([ring])).toEqual({ south: 0, north: 299_999, west: 0, east: 299_999 });
  });
});

describe('createGridIndex', () => {
  const items = Array.from({ length: 200 }, (_, i) => square(50 + (i % 20) * 0.01, 30 + Math.floor(i / 20) * 0.01, 0.004));

  it('finds every item that holds a point, as a full scan does, in the same order', () => {
    const index = createGridIndex(items, (item) => item);
    for (let lat = 49.99; lat < 50.22; lat += 0.0013) {
      for (let lng = 29.99; lng < 30.12; lng += 0.0017) {
        const point = { lat, lng };
        expect(index.near(point).filter((item) => isInside(point, item))).toEqual(items.filter((item) => isInside(point, item)));
      }
    }
  });

  it('reads far fewer items than the whole tile', () => {
    const index = createGridIndex(items, (item) => item);
    expect(index.near({ lat: 50.05, lng: 30.05 }).length).toBeLessThan(items.length / 4);
  });

  it('knows nothing outside the items, and nothing when there are none', () => {
    expect(createGridIndex(items, (item) => item).near({ lat: 0, lng: 0 })).toEqual([]);
    expect(createGridIndex<Outline>([], (item) => item).near({ lat: 50, lng: 30 })).toEqual([]);
  });
});
