import { act, render } from '@testing-library/react';
import { MapView } from './MapView';
import { useThemeStore } from '../theme/themeStore';
import { useLocationStore } from '../location/locationStore';
import { mapInstances } from '../test/maplibreMock';
import { useMapViewStore } from './mapStyles';
import { useMapIssueStore } from './mapIssue';
import { useMapScaleStore } from './mapScaleStore';

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

describe('3D buildings', () => {
  beforeEach(() => {
    mapInstances.length = 0;
    useThemeStore.setState({ theme: 'dark' });
    useMapViewStore.setState({ view: 'auto', buildings3d: true });
  });

  it('adds the extrusion layer on style load and tilts the camera', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('style.load', {} as never));
    expect(mapInstances[0].getLayer('3d-buildings')).toBeTruthy();
    expect(mapInstances[0].pitch).toBe(50);
  });

  it('hides the layer and flattens the camera when turned off', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('style.load', {} as never));
    act(() => useMapViewStore.getState().setBuildings3d(false));
    expect(mapInstances[0].getLayer('3d-buildings')?.visibility).toBe('none');
    expect(mapInstances[0].pitch).toBe(0);
  });

  it('shows a banner when terrain fails, and clears it on the next style load', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('error', { sourceId: 'terrain-dem', error: new Error('x') } as never));
    expect(useMapIssueStore.getState().issue).toBe('terrain');
    act(() => mapInstances[0].emit('style.load', {} as never));
    expect(useMapIssueStore.getState().issue).toBeNull();
  });

  it('flags a style failure and ignores tile errors', () => {
    render(<MapView />);
    act(() => mapInstances[0].emit('error', { sourceId: 'openmaptiles', error: new Error('tile') } as never));
    expect(useMapIssueStore.getState().issue).toBeNull();
    act(() => mapInstances[0].emit('error', { error: new Error('style') } as never));
    expect(useMapIssueStore.getState().issue).toBe('style');
    useMapIssueStore.setState({ issue: null });
  });

  it('refreshes ground elevation on idle', () => {
    render(<MapView />);
    act(() => useLocationStore.getState().select({ lat: 50, lng: 30 }));
    act(() => mapInstances[0].emit('idle', {} as never));
    expect(useLocationStore.getState().groundM).toBe(180);
  });

  it('reports the scale from the map center on creation', () => {
    useMapScaleStore.setState({ metersPerPx: null });
    render(<MapView />);
    expect(useMapScaleStore.getState().metersPerPx).toBeGreaterThan(0);
  });
});
