import { act, render } from '@testing-library/react';
import { MapView } from './MapView';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { mapInstances } from '../test/maplibreMock';
import { useMapViewStore } from './mapStyles';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

describe('MapView', () => {
  beforeEach(() => {
    mapInstances.length = 0;
    useThemeStore.setState({ theme: 'dark' });
    useLocationStore.setState({ selected: null });
    useMapViewStore.setState({ view: 'auto' });
  });

  it('creates the map with the dark style by default', () => {
    render(<MapView />);
    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/fiord');
  });

  it('selects a location when the map is clicked', () => {
    render(<MapView />);
    act(() => {
      mapInstances[0].emit('click', { lngLat: { lat: 50.1, lng: 30.2 } });
    });
    expect(useLocationStore.getState().selected).toEqual({ lat: 50.1, lng: 30.2 });
  });

  it('switches the basemap style when the theme changes', () => {
    render(<MapView />);
    act(() => useThemeStore.getState().setTheme('light'));
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('switches to the landscape style when the map view changes', () => {
    render(<MapView />);
    act(() => useMapViewStore.getState().setView('landscape'));
    expect(mapInstances[0].style).toBe('https://tiles.openfreemap.org/styles/bright');
  });
});
