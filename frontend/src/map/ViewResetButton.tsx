import { useTranslation } from 'react-i18next';
import { resetMapView } from './viewReset';

// Returns to the default center, zoom, north-up and the default tilt for the current 3D setting.
export function ViewResetButton() {
  const { t } = useTranslation();
  return (
    <button type="button" className="view-reset" onClick={resetMapView} title={t('map.resetView')}>
      {t('map.resetView')}
    </button>
  );
}
