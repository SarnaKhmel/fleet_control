import { render, screen } from '@testing-library/react';
import { WindCompass } from './WindCompass';
import { useWindStore } from './windStore';

describe('WindCompass', () => {
  it('shows the speed and the direction the wind blows toward', () => {
    useWindStore.setState({ wind: { speedMs: 4.25, fromDeg: 270 }, status: 'ready' });
    render(<WindCompass />);
    // From the west (270) → blows toward the east (90).
    expect(screen.getByText('4.3 m/s toward E (90°)')).toBeTruthy();
  });

  it('rotates the arrow to the blowing direction', () => {
    useWindStore.setState({ wind: { speedMs: 2, fromDeg: 0 }, status: 'ready' });
    const { container } = render(<WindCompass />);
    expect(container.querySelector('g')?.getAttribute('transform')).toBe('translate(50 50) rotate(180)');
  });

  it('shows a loading or unavailable message', () => {
    useWindStore.setState({ status: 'loading' });
    const { unmount } = render(<WindCompass />);
    expect(screen.getByText('Loading wind…')).toBeTruthy();
    unmount();
    useWindStore.setState({ status: 'error' });
    render(<WindCompass />);
    expect(screen.getByText('Wind unavailable')).toBeTruthy();
  });
});
