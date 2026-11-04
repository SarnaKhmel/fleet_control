import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeCity, parseNominatim } from './geocode';

describe('parseNominatim', () => {
  it('reads lat/lon strings from the first result', () => {
    expect(parseNominatim([{ lat: '50.4501', lon: '30.5234' }])).toEqual({ lat: 50.4501, lng: 30.5234 });
  });

  it('returns null for no results or bad data', () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({})).toBeNull();
    expect(parseNominatim([{ lat: 'x', lon: '1' }])).toBeNull();
  });
});

describe('geocodeCity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('queries Nominatim with the city and language', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '50.4501', lon: '30.5234' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const point = await geocodeCity('Київ', 'uk');

    expect(point).toEqual({ lat: 50.4501, lng: 30.5234 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('q=%D0%9A%D0%B8%D1%97%D0%B2');
    expect(url).toContain('accept-language=uk');
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(geocodeCity('Kyiv', 'en')).rejects.toThrow('429');
  });
});
