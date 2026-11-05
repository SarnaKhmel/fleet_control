import { render, screen } from '@testing-library/react';
import { Legend } from './Legend';

describe('Legend', () => {
  it('lists every symbol with its meaning and a link back to the map', () => {
    const { container } = render(<Legend />);
    expect(container.querySelectorAll('.legend-symbol svg').length).toBe(14);
    expect(screen.getByText('Own drone (unmanned aerial vehicle)')).toBeTruthy();
    expect(screen.getByText('Enemy armoured vehicles (the arrow: on the move, where to)')).toBeTruthy();
    expect(screen.getByText('Allied unit (sees 2 km around)')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Map' }).getAttribute('href')).toBe('/');
  });
});
