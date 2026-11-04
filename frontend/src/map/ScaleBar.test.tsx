import { render, screen } from '@testing-library/react';
import { ScaleBar } from './ScaleBar';
import { useMapScaleStore } from './mapScaleStore';

describe('ScaleBar', () => {
  it('shows nothing until the map reports its scale', () => {
    useMapScaleStore.setState({ metersPerPx: null });
    const { container } = render(<ScaleBar />);
    expect(container.innerHTML).toBe('');
  });

  it('labels the bar with a round distance', () => {
    useMapScaleStore.setState({ metersPerPx: 100 });
    render(<ScaleBar />);
    expect(screen.getByText('10 km')).toBeTruthy();
    useMapScaleStore.setState({ metersPerPx: null });
  });
});
