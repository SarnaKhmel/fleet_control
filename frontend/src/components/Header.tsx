import { useState, type FormEvent } from 'react';
import { BurgerMenu } from './BurgerMenu';
import { useTranslation } from 'react-i18next';
import { parseLatLng } from '../location/parseLatLng';
import { useLocationStore } from '../location/locationStore';
import { geocodeCity } from '../location/geocode';
import { SettingsButton } from './SettingsButton';
import { ResetAllButton } from './ResetAllButton';

export function Header() {
  const { t, i18n } = useTranslation();
  const choose = useLocationStore((state) => state.choose);
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
        <ResetAllButton />
        <SettingsButton />
      </div>
    </header>
  );
}
