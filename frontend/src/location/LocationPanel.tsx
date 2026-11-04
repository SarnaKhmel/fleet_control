import { useTranslation } from 'react-i18next';
import { formatLatLng, useLocationStore } from './locationStore';

export function LocationPanel() {
  const { t } = useTranslation();
  const selected = useLocationStore((state) => state.selected);
  const clear = useLocationStore((state) => state.clear);

  return (
    <aside className="location-panel" aria-label={t('location.title')}>
      <h2>{t('location.title')}</h2>
      {selected ? (
        <>
          <p className="location-coords">{formatLatLng(selected)}</p>
          <button type="button" onClick={clear}>
            {t('location.clear')}
          </button>
        </>
      ) : (
        <p className="muted">{t('location.hint')}</p>
      )}
    </aside>
  );
}
