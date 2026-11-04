import { describe, expect, it } from 'vitest';
import { metersPerPixel, niceScale } from './scale';

describe('metersPerPixel', () => {
  it('matches the Web Mercator value at the equator, zoom 0', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
  });

  it('halves at each zoom level and shrinks with latitude', () => {
    expect(metersPerPixel(50, 11)).toBeCloseTo(metersPerPixel(50, 10) / 2, 6);
    expect(metersPerPixel(60, 10)).toBeLessThan(metersPerPixel(0, 10));
  });
});

describe('niceScale', () => {
  it('picks a round length that fits the bar', () => {
    const s = niceScale(100, 120); // 12 km raw → 10 km
    expect(s.meters).toBe(10000);
    expect(s.label).toBe('10 km');
    expect(s.px).toBeCloseTo(100, 6);
  });

  it('uses meters below one kilometer', () => {
    expect(niceScale(5, 120).label).toBe('500 m');
  });
});
