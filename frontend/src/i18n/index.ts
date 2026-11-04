import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';

export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = 'fleet.language';

export function isLanguage(value: string | null): value is Language {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

// Saved choice wins; otherwise follow the browser language (Ukrainian or English only).
export function resolveLanguage(stored: string | null, browserLanguage: string): Language {
  if (isLanguage(stored)) return stored;
  return browserLanguage.slice(0, 2).toLowerCase() === 'uk' ? 'uk' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY), navigator.language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export function setLanguage(language: Language): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  void i18n.changeLanguage(language);
}

export default i18n;
