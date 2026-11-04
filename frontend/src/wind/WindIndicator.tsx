import { useTranslation } from 'react-i18next';
import { compassPoint } from './compass';
import { useWindStore } from './windStore';

// Shows where the wind blows TO (not where it comes from), with an arrow and speed.
export function WindIndicator() {
  const { t } = useTranslation();
  const wind = useWindStore((state) => state.wind);
  const toDeg = (wind.fromDeg + 180) % 360;
  const dir = compassPoint(toDeg);

  return (
    <div className="wind-indicator" role="status" aria-label={t('wind.title')}>
      <span className="wind-arrow" style={{ transform: `rotate(${toDeg}deg)` }} aria-hidden="true">
        ↑
      </span>
      <span>
        {t('wind.label', {
          speed: wind.speedMs.toFixed(1),
          dir: t(`compass.${dir}`),
          deg: Math.round(toDeg),
        })}
      </span>
    </div>
  );
}
