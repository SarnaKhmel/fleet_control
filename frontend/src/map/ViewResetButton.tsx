import { useTranslation } from 'react-i18next';
import { resetMapView } from './viewReset';

// Icon button: returns to the default center, zoom, north-up and the default tilt. Tooltip on hover.
export function ViewResetButton() {
  const { t } = useTranslation();
  return (
    <button type="button" className="view-reset" onClick={resetMapView} aria-label={t('map.resetView')} title={t('map.resetView')}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  );
}
