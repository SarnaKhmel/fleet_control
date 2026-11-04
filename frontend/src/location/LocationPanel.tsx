import { useTranslation } from 'react-i18next';
import { formatLatLng, useLocationStore } from './locationStore';

export function LocationPanel() {
  const { t } = useTranslation();
  const selected = useLocationStore((state) => state.selected);
  const saved = useLocationStore((state) => state.saved);
  const { clear, save, choose, removeSaved } = useLocationStore.getState();

  return (
    <aside className="location-panel" aria-label={t('location.title')}>
      <h2>{t('location.title')}</h2>
      {selected ? (
        <>
          <p className="location-coords">{formatLatLng(selected)}</p>
          <div className="location-actions">
            <button type="button" onClick={save}>
              {t('location.save')}
            </button>
            <button type="button" onClick={clear}>
              {t('location.clear')}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">{t('location.hint')}</p>
      )}

      <h3>{t('location.saved')}</h3>
      {saved.length === 0 ? (
        <p className="muted">{t('location.noSaved')}</p>
      ) : (
        <ul className="saved-list">
          {saved.map((point, index) => (
            <li key={formatLatLng(point)}>
              <button type="button" onClick={() => choose(point)}>
                {formatLatLng(point)}
              </button>
              <button
                type="button"
                aria-label={t('location.remove')}
                title={t('location.remove')}
                onClick={() => removeSaved(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
