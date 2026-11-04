import { fireEvent, render, screen } from '@testing-library/react';
import { BurgerMenu } from './BurgerMenu';

describe('BurgerMenu', () => {
  it('opens a menu with a link to the legend page', () => {
    render(<BurgerMenu />);
    expect(screen.queryByRole('link', { name: 'Legend' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('link', { name: 'Legend' }).getAttribute('href')).toBe('/legend.html');
  });
});
