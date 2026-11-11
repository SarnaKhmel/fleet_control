import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { HIT_EFFECT_MS, playHitEffect } from './hitEffect';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

describe('hit effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    markerInstances.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('puts a marker with the outcome class at the unit, and removes it when the animation is over', () => {
    const map = new FakeMap({ style: 'x' });
    playHitEffect(map as never, { lat: 50.1, lng: 30 }, 'destroyed');
    const [marker] = markerInstances;
    expect(marker.added).toBe(true);
    expect(marker.lngLat).toEqual([30, 50.1]);
    expect(marker.element?.className).toBe('hit-effect is-destroyed');
    vi.advanceTimersByTime(HIT_EFFECT_MS);
    expect(marker.added).toBe(false);
  });

  it('marks damage with its own class', () => {
    playHitEffect(new FakeMap({ style: 'x' }) as never, { lat: 50, lng: 30 }, 'damaged');
    expect(markerInstances[0].element?.classList.contains('is-damaged')).toBe(true);
  });
});
