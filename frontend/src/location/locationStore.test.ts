import { describe, expect, it, beforeEach } from 'vitest';
import { formatLatLng, useLocationStore } from './locationStore';

describe('locationStore', () => {
  beforeEach(() => useLocationStore.setState({ selected: null }));

  it('selects and clears a location', () => {
    useLocationStore.getState().select({ lat: 1, lng: 2 });
    expect(useLocationStore.getState().selected).toEqual({ lat: 1, lng: 2 });
    useLocationStore.getState().clear();
    expect(useLocationStore.getState().selected).toBeNull();
  });

  it('formats coordinates with five decimals', () => {
    expect(formatLatLng({ lat: 50.4501, lng: 30.5234 })).toBe('50.45010, 30.52340');
  });
});
