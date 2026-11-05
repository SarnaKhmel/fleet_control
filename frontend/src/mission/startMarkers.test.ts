import { describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { syncStartMarkers } from './startMarkers';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

describe('syncStartMarkers', () => {
  it('shows one marker per point and removes the old ones', () => {
    const map = new FakeMap({ style: 'x' });
    const first = syncStartMarkers(map as never, [], [{ lat: 50, lng: 30 }, { lat: 50.1, lng: 30.1 }]);
    expect(first).toHaveLength(2);
    expect(first.every((m) => (m as unknown as { added: boolean }).added)).toBe(true);

    const second = syncStartMarkers(map as never, first, [{ lat: 50.2, lng: 30.2 }]);
    expect(second).toHaveLength(1);
    expect(first.some((m) => (m as unknown as { added: boolean }).added)).toBe(false);
    expect(markerInstances.length).toBeGreaterThanOrEqual(3);
  });
});
