import { render, screen } from '@testing-library/react';
import { WindIndicator } from './WindIndicator';
import { useWindStore } from './windStore';

describe('WindIndicator', () => {
  it('shows the speed and the direction the wind blows toward', () => {
    useWindStore.setState({ wind: { speedMs: 4.25, fromDeg: 270 } });
    render(<WindIndicator />);
    // From the west (270) → blows toward the east (90).
    expect(screen.getByText('4.3 m/s toward E (90°)')).toBeTruthy();
  });

  it('rotates the arrow with the blowing direction', () => {
    useWindStore.setState({ wind: { speedMs: 2, fromDeg: 0 } });
    const { container } = render(<WindIndicator />);
    const arrow = container.querySelector('.wind-arrow') as HTMLElement;
    expect(arrow.style.transform).toBe('rotate(180deg)');
  });
});
