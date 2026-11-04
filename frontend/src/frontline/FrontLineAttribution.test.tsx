import { render, screen } from '@testing-library/react';
import { FrontLineAttribution } from './FrontLineAttribution';
import { useFrontLineStore } from './frontLine';

describe('FrontLineAttribution', () => {
  it('is hidden while the layer is off', () => {
    useFrontLineStore.setState({ enabled: false });
    const { container } = render(<FrontLineAttribution />);
    expect(container.innerHTML).toBe('');
  });

  it('credits DeepStateMap.live and marks the zones as approximate', () => {
    useFrontLineStore.setState({ enabled: true });
    render(<FrontLineAttribution />);
    expect(screen.getByRole('link', { name: 'Approximate, based on DeepStateMap.live' }).getAttribute('href')).toBe('https://deepstatemap.live');
    expect(screen.getByText('Hand-traced zones, not survey data. Not the real front line.')).toBeTruthy();
    useFrontLineStore.setState({ enabled: false });
  });
});
