import { describe, expect, it, beforeEach } from 'vitest';
import { formatLatLng, SAVED_LOCATIONS_KEY, useLocationStore } from './locationStore';

const store = () => useLocationStore.getState();

describe('locationStore', () => {
  beforeEach(() => useLocationStore.setState({ selected: null, saved: [], focusTick: 0 }));

  it('selects and clears a location', () => {
    store().select({ lat: 1, lng: 2 });
    expect(store().selected).toEqual({ lat: 1, lng: 2 });
    store().clear();
    expect(store().selected).toBeNull();
  });

  it('choose bumps focusTick, select does not', () => {
    store().select({ lat: 1, lng: 2 });
    expect(store().focusTick).toBe(0);
    store().choose({ lat: 3, lng: 4 });
    expect(store().focusTick).toBe(1);
    expect(store().selected).toEqual({ lat: 3, lng: 4 });
  });

  it('saves the selected location once', () => {
    store().choose({ lat: 1, lng: 2 });
    store().save();
    store().save();
    expect(store().saved).toEqual([{ lat: 1, lng: 2 }]);
  });

  it('removes a saved location by index', () => {
    store().choose({ lat: 1, lng: 2 });
    store().save();
    store().choose({ lat: 5, lng: 6 });
    store().save();
    store().removeSaved(0);
    expect(store().saved).toEqual([{ lat: 5, lng: 6 }]);
  });

  it('persists only saved locations to localStorage', () => {
    store().choose({ lat: 1, lng: 2 });
    store().save();
    const raw = localStorage.getItem(SAVED_LOCATIONS_KEY) ?? '';
    expect(raw).toContain('"lat":1');
    expect(raw).not.toContain('selected');
  });

  it('formats coordinates with five decimals', () => {
    expect(formatLatLng({ lat: 50.4501, lng: 30.5234 })).toBe('50.45010, 30.52340');
  });
});
