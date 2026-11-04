import { fireEvent, render, screen } from '@testing-library/react';
import i18n from './i18n';
import { App } from './App';
import { useThemeStore } from './theme/themeStore';

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useThemeStore.setState({ theme: 'dark' });
  });

  it('renders the English title by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Fleet Mission Control' })).toBeTruthy();
  });

  it('switches language and saves the choice', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'uk' } });

    expect(screen.getByRole('heading', { name: 'Центр керування флотом' })).toBeTruthy();
    expect(localStorage.getItem('fleet.language')).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('toggles the theme, applies it to the document and saves it', () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('fleet.theme')).toContain('"light"');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeTruthy();
  });
});
