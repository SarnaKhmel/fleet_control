import { fireEvent, render, screen } from '@testing-library/react';
import { bearingDegrees, MapCompass } from './MapCompass';
import { useMapScaleStore } from './mapScaleStore';
import { registerNorthUp } from './viewReset';

describe('MapCompass', () => {
  afterEach(() => {
    useMapScaleStore.setState({ bearing: 0 });
    registerNorthUp(null);
  });

  it('turns the needle against the map bearing and says how far the map is turned', () => {
    useMapScaleStore.setState({ bearing: 30 });
    render(<MapCompass />);
    const button = screen.getByRole('button', { name: /map turned 30°/ });
    expect(button.querySelector('svg')!.style.transform).toBe('rotate(-30deg)');
  });

  it('turns the map north up when clicked', () => {
    const northUp = vi.fn();
    registerNorthUp(northUp);
    render(<MapCompass />);
    fireEvent.click(screen.getByRole('button', { name: /Compass/ }));
    expect(northUp).toHaveBeenCalledOnce();
  });

  it('shows the bearing as 0–359 degrees', () => {
    expect(bearingDegrees(-30)).toBe(330);
    expect(bearingDegrees(179.6)).toBe(180);
    expect(bearingDegrees(-0.2)).toBe(0);
  });
});
