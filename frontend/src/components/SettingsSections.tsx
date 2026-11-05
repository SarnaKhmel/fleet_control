import { useTranslation } from 'react-i18next';
import { isLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { THEMES, useThemeStore, type Theme } from '../theme/themeStore';
import { useMapViewStore, type MapView } from '../map/mapStyles';
import { loadFrontLine, useFrontLineStore } from '../frontline/frontLine';
import { useSymbolStyleStore, type SymbolStyle } from '../mission/symbolStyle';
import { Accordion } from '../sidebar/Accordion';

const THEME_LABEL_KEYS: Record<Theme, string> = {
  dark: 'header.themeDark',
  light: 'header.themeLight',
  tactical: 'header.themeTactical',
};

// Settings sections (accordions): general, map and drone symbols.
export function SettingsSections() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const mapView = useMapViewStore((state) => state.view);
  const setMapView = useMapViewStore((state) => state.setView);
  const buildings3d = useMapViewStore((state) => state.buildings3d);
  const setBuildings3d = useMapViewStore((state) => state.setBuildings3d);
  const frontEnabled = useFrontLineStore((state) => state.enabled);
  const setFrontEnabled = useFrontLineStore((state) => state.setEnabled);
  const symbolStyle = useSymbolStyleStore((state) => state.style);
  const setSymbolStyle = useSymbolStyleStore((state) => state.setStyle);

  return (
    <>
      <Accordion title={t('settings.general')} defaultOpen>
        <label className="settings-row">
          <span>{t('header.language')}</span>
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
        </label>
        <label className="settings-row">
          <span>{t('settings.theme')}</span>
          <select aria-label={t('settings.theme')} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
            {THEMES.map((name) => (
              <option key={name} value={name}>
                {t(THEME_LABEL_KEYS[name])}
              </option>
            ))}
          </select>
        </label>
      </Accordion>

      <Accordion title={t('settings.map')}>
        <label className="settings-row">
          <span>{t('header.mapView')}</span>
          <select aria-label={t('header.mapView')} value={mapView} onChange={(event) => setMapView(event.target.value as MapView)}>
            <option value="auto">{t('header.mapAuto')}</option>
            <option value="landscape">{t('header.mapLandscape')}</option>
            <option value="satellite">{t('header.mapSatellite')}</option>
          </select>
        </label>
        <div className="settings-row">
          <span>{t('settings.buildings')}</span>
          <button type="button" aria-pressed={buildings3d} onClick={() => setBuildings3d(!buildings3d)}>
            {t(buildings3d ? 'header.buildings3dOn' : 'header.buildings3dOff')}
          </button>
        </div>
        <div className="settings-row">
          <span>{t('settings.frontLine')}</span>
          <button
            type="button"
            aria-pressed={frontEnabled}
            onClick={() => {
              if (!frontEnabled) void loadFrontLine();
              setFrontEnabled(!frontEnabled);
            }}
          >
            {t(frontEnabled ? 'frontLine.on' : 'frontLine.off')}
          </button>
        </div>
      </Accordion>

      <Accordion title={t('settings.drones')}>
        <label className="settings-row">
          <span>{t('header.symbols')}</span>
          <select aria-label={t('header.symbols')} value={symbolStyle} onChange={(event) => setSymbolStyle(event.target.value as SymbolStyle)}>
            <option value="nato">{t('header.symbolsNato')}</option>
            <option value="custom">{t('header.symbolsCustom')}</option>
          </select>
        </label>
      </Accordion>
    </>
  );
}
