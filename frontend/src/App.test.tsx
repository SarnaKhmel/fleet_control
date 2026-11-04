import { fireEvent, render, screen, act } from '@testing-library/react';
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
    useLocationStore.setState({ selected: null });
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
    });
    expect(screen.getByText('50.50000, 30.25000')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Click the map to choose a location.')).toBeTruthy();
  });
});
