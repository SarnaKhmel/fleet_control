import { useTranslation } from 'react-i18next';
import { isLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useThemeStore } from '../theme/themeStore';

export function Header() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <header className="header">
      <h1>{t('app.title')}</h1>
      <div className="header-controls">
        <select
          aria-label={t('header.language')}
          value={i18n.language}
          onChange={(event) => {
            if (isLanguage(event.target.value)) setLanguage(event.target.value);
          }}
        >
          {SUPPORTED_LANGUAGES.map((lng) => (
            <option key={lng} value={lng}>
              {lng === 'uk' ? 'Українська' : 'English'}
            </option>
          ))}
        </select>
        <button type="button" onClick={toggleTheme}>
          {t(theme === 'dark' ? 'header.switchToLight' : 'header.switchToDark')}
        </button>
      </div>
    </header>
  );
}
