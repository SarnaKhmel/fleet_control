import { describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { offsetLatLng } from '../../../shared/mission/area';
import { removeZoneLabels, syncZoneLabels, zoneSize } from './zoneLabels';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

const center = { lat: 50, lng: 30 };
// A 12 km by 8 km rectangle, corners in any order.
const ring = [
  offsetLatLng(center, -6000, -4000),
  offsetLatLng(center, 6000, -4000),
  offsetLatLng(center, 6000, 4000),
  offsetLatLng(center, -6000, 4000),
];

describe('zone labels', () => {
  it('measures the width and height of the zone and where their labels sit', () => {
    const size = zoneSize(ring);
    expect(size.widthKm).toBeCloseTo(12, 1);
    expect(size.heightKm).toBeCloseTo(8, 1);
    expect(size.top.lat).toBeGreaterThan(center.lat); // top edge, north of the middle
    expect(Math.abs(size.top.lng - center.lng)).toBeLessThan(1e-6); // centered on the edge
    expect(size.right.lng).toBeGreaterThan(center.lng); // right edge, east of the middle
  });

  it('puts the width and height on the map and moves them with the zone', () => {
    const map = new FakeMap({ style: 'x' });
    syncZoneLabels(map as never, ring);
    const [width, height] = markerInstances.slice(-2);
    expect(width.element?.textContent).toMatch(/12\.0 km$/);
    expect(height.element?.textContent).toMatch(/8\.0 km$/);
    expect(width.added && height.added).toBe(true);
    syncZoneLabels(map as never, [offsetLatLng(center, -10000, -4000), offsetLatLng(center, 10000, -4000), offsetLatLng(center, 10000, 4000), offsetLatLng(center, -10000, 4000)]);
    expect(width.element?.textContent).toMatch(/20\.0 km$/);
    removeZoneLabels();
    expect(width.added).toBe(false);
    expect(height.added).toBe(false);
  });
});
