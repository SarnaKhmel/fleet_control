import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocationStore } from '../location/locationStore';
import { startWindSync, WIND_DEBOUNCE_MS } from './windSync';

describe('wind debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLocationStore.setState({ selected: null, groundM: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requests wind once for the last of several quick location changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { wind_speed_10m: 2, wind_direction_10m: 10 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    startWindSync();
    await vi.runOnlyPendingTimersAsync();
    fetchMock.mockClear();

    useLocationStore.getState().select({ lat: 1, lng: 1 });
    useLocationStore.getState().select({ lat: 2, lng: 2 });
    useLocationStore.getState().select({ lat: 3, lng: 3 });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WIND_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('latitude=3');
  });
});
