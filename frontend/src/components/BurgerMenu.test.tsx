import { fireEvent, render, screen } from '@testing-library/react';
import { BurgerMenu } from './BurgerMenu';

describe('BurgerMenu', () => {
  it('opens a full-height drawer with links to the pages', () => {
    render(<BurgerMenu />);
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('link', { name: 'Legend' }).getAttribute('href')).toBe('/legend.html');
  });

  it('closes with the close button and with Escape', () => {
    render(<BurgerMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
