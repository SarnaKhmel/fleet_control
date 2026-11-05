import { useTranslation } from 'react-i18next';
import { useMapScaleStore } from './mapScaleStore';
import { turnNorthUp } from './viewReset';

/** Bearing as a whole number of degrees, 0–359. */
export function bearingDegrees(bearing: number): number {
  return ((Math.round(bearing) % 360) + 360) % 360;
}

// Compass next to the scale bar: the needle points north and turns with the map. Click to face north.
export function MapCompass() {
  const { t } = useTranslation();
  const bearing = useMapScaleStore((state) => state.bearing);
  const label = t('map.compass', { deg: bearingDegrees(bearing) });
  return (
    <button type="button" className="map-compass" onClick={turnNorthUp} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${-bearing}deg)` }}>
        <path className="map-compass-north" d="M12 2l4 10h-8z" />
        <path className="map-compass-south" d="M12 22l-4-10h8z" />
        <text x="12" y="9.5" textAnchor="middle">N</text>
      </svg>
    </button>
  );
}
