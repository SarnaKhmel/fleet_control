import { fireEvent, render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from './i18n';
import { App } from './App';
import { useThemeStore } from './theme/themeStore';
import { useLocationStore } from './location/locationStore';
import { mapInstances } from './test/maplibreMock';

vi.mock('maplibre-gl', () => import('./test/maplibreMock'));

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useThemeStore.setState({ theme: 'dark' });
    useLocationStore.setState({ selected: null, saved: [], focusTick: 0 });
    mapInstances.length = 0;
  });

  it('renders the English title by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Fleet Mission Control' })).toBeTruthy();
  });

  it('switches language and saves the choice', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'uk' } });

    expect(screen.getByRole('heading', { name: 'Центр керування флотом' })).toBeTruthy();
    expect(localStorage.getItem('fleet.language')).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('toggles the theme, applies it to the document and saves it', () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('fleet.theme')).toContain('"light"');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeTruthy();
  });

  it('shows the selected location and clears it', () => {
    render(<App />);
    expect(screen.getByText('Click the map to choose a location.')).toBeTruthy();

    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.5, lng: 30.25 } });
      mapInstances[0].emit('idle', {} as never);
    });
    expect(screen.getByText('50.50000, 30.25000')).toBeTruthy();
    expect(screen.getByText('Ground elevation: 180 m')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Click the map to choose a location.')).toBeTruthy();
  });

  it('chooses a location from the header, saves it and selects it again later', () => {
    render(<App />);
    const input = screen.getByLabelText('Coordinates');

    fireEvent.change(input, { target: { value: '50.1, 30.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByText('50.10000, 30.20000')).toBeTruthy();
    expect(mapInstances[0].lastFlyTo?.center).toEqual([30.2, 50.1]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useLocationStore.getState().saved).toEqual([{ lat: 50.1, lng: 30.2 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: '50.10000, 30.20000' }));
    expect(document.querySelector('.location-coords')?.textContent).toBe('50.10000, 30.20000');
  });

  it('updates the wind to the wind at the selected location', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { wind_speed_10m: 5, wind_direction_10m: 90 } }) }),
    );
    render(<App />);
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.5, lng: 30.25 } });
    });
    // From the east (90) → blows toward the west (270).
    expect(await screen.findByText('5.0 m/s toward W (270°)')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('finds a city by name through the header search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ lat: '50.4501', lon: '30.5234' }] }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Coordinates'), { target: { value: 'Kyiv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('50.45010, 30.52340')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('shows an error when the city is not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Coordinates'), { target: { value: 'Nowhere-land' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect((await screen.findByRole('alert')).textContent).toBe('City not found');
    expect(useLocationStore.getState().selected).toBeNull();
    vi.unstubAllGlobals();
  });
});
