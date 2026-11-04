import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import uk from './locales/uk.json';
import { isLanguage, resolveLanguage } from './index';

function keysOf(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null
      ? keysOf(child as Record<string, unknown>, path)
      : [path];
  });
}

describe('resolveLanguage', () => {
  it('prefers a valid saved language over the browser language', () => {
    expect(resolveLanguage('en', 'uk-UA')).toBe('en');
  });

  it('ignores an unsupported saved value and uses the browser language', () => {
    expect(resolveLanguage('de', 'uk-UA')).toBe('uk');
  });

  it('falls back to English for unsupported browser languages', () => {
    expect(resolveLanguage(null, 'de-DE')).toBe('en');
    expect(resolveLanguage(null, 'ru-RU')).toBe('en');
  });

  it('detects Ukrainian from the browser language', () => {
    expect(resolveLanguage(null, 'uk')).toBe('uk');
  });
});

describe('isLanguage', () => {
  it('accepts only supported codes', () => {
    expect(isLanguage('uk')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe('translations', () => {
  it('have the same keys in every locale', () => {
    expect(keysOf(uk).sort()).toEqual(keysOf(en).sort());
  });
});
