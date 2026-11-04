import { useState, type FormEvent } from 'react';
import { BurgerMenu } from './BurgerMenu';
import { useTranslation } from 'react-i18next';
import { isLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useThemeStore } from '../theme/themeStore';
import { parseLatLng } from '../location/parseLatLng';
import { useLocationStore } from '../location/locationStore';
import { geocodeCity } from '../location/geocode';
import { useMapViewStore, type MapView } from '../map/mapStyles';

export function Header() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const choose = useLocationStore((state) => state.choose);
  const mapView = useMapViewStore((state) => state.view);
  const setMapView = useMapViewStore((state) => state.setView);
  const buildings3d = useMapViewStore((state) => state.buildings3d);
  const setBuildings3d = useMapViewStore((state) => state.setBuildings3d);
  const [coords, setCoords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = coords.trim();
    if (!query) return;
    setError(null);

    const direct = parseLatLng(query);
    if (direct) {
      choose(direct);
      setCoords('');
      return;
    }

    setSearching(true);
    try {
      const point = await geocodeCity(query, i18n.language);
      if (point) {
        choose(point);
        setCoords('');
      } else {
        setError(t('header.cityNotFound'));
      }
    } catch {
      setError(t('header.geocodeError'));
    } finally {
      setSearching(false);
    }
  }

  return (
    <header className="header">
      <div className="header-start">
        <BurgerMenu />
        <h1>{t('app.title')}</h1>
      </div>
      <div className="header-controls">
        <form className="coords-form" onSubmit={submitCoordinates} noValidate>
          <input
            aria-label={t('header.coordinates')}
            placeholder={t('header.coordinatesPlaceholder')}
            value={coords}
            aria-invalid={error !== null}
            onChange={(event) => {
              setCoords(event.target.value);
              setError(null);
            }}
          />
          <button type="submit" disabled={searching}>
            {t('header.go')}
          </button>
          {error && (
            <span role="alert" className="form-error">
              {error}
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
        <button type="button" aria-pressed={buildings3d} onClick={() => setBuildings3d(!buildings3d)}>
          {t(buildings3d ? 'header.buildings3dOn' : 'header.buildings3dOff')}
        </button>
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
