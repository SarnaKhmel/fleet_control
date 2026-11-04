import { useTranslation } from 'react-i18next';
import { compassPoint } from './compass';
import { useWindStore } from './windStore';

// Compass rose with wind direction and speed, plus compact temperature and humidity.
// The arrow points where the wind blows TO.
export function WindCompass() {
  const { t } = useTranslation();
  const wind = useWindStore((state) => state.wind);
  const status = useWindStore((state) => state.status);
  const temperatureC = useWindStore((state) => state.temperatureC);
  const humidityPct = useWindStore((state) => state.humidityPct);
  const toDeg = (wind.fromDeg + 180) % 360;
  const dir = compassPoint(toDeg);

  return (
    <div className="wind-compass" role="status" aria-label={t('wind.title')}>
      <svg viewBox="0 0 100 100" className="wind-compass-dial" aria-hidden="true">
        <circle cx="50" cy="50" r="46" />
        <text x="50" y="16" textAnchor="middle">
          N
        </text>
        <g transform={`translate(50 50) rotate(${toDeg})`}>
          <line x1="0" y1="26" x2="0" y2="-22" />
          <polygon points="0,-34 -9,-18 9,-18" />
        </g>
      </svg>
      <div className="wind-compass-text">
        {status === 'error' ? (
          <span>{t('wind.unavailable')}</span>
        ) : status === 'loading' ? (
          <span>{t('wind.loading')}</span>
        ) : (
          <>
            <span>
              {t('wind.label', {
                speed: wind.speedMs.toFixed(1),
                dir: t(`compass.${dir}`),
                deg: Math.round(toDeg),
              })}
            </span>
            {(temperatureC !== null || humidityPct !== null) && (
              <span className="wind-climate">
                {temperatureC !== null && <span title={t('wind.temperature')}>{t('wind.tempValue', { value: Math.round(temperatureC) })}</span>}
                {humidityPct !== null && <span title={t('wind.humidity')}>{t('wind.humidityValue', { value: Math.round(humidityPct) })}</span>}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
