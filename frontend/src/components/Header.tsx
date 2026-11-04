import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useThemeStore } from '../theme/themeStore';
import { parseLatLng } from '../location/parseLatLng';
import { useLocationStore } from '../location/locationStore';
import { useMapViewStore, type MapView } from '../map/mapStyles';

export function Header() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const choose = useLocationStore((state) => state.choose);
  const mapView = useMapViewStore((state) => state.view);
  const setMapView = useMapViewStore((state) => state.setView);
  const [coords, setCoords] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const point = parseLatLng(coords);
    if (!point) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    choose(point);
    setCoords('');
  }

  return (
    <header className="header">
      <h1>{t('app.title')}</h1>
      <div className="header-controls">
        <form className="coords-form" onSubmit={submitCoordinates} noValidate>
          <input
            aria-label={t('header.coordinates')}
            placeholder={t('header.coordinatesPlaceholder')}
            value={coords}
            aria-invalid={invalid}
            onChange={(event) => {
              setCoords(event.target.value);
              setInvalid(false);
            }}
          />
          <button type="submit">{t('header.go')}</button>
          {invalid && (
            <span role="alert" className="form-error">
              {t('header.coordinatesInvalid')}
            </span>
          )}
        </form>
        <select
          aria-label={t('header.mapView')}
          value={mapView}
          onChange={(event) => setMapView(event.target.value as MapView)}
        >
          <option value="auto">{t('header.mapAuto')}</option>
          <option value="landscape">{t('header.mapLandscape')}</option>
        </select>
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
