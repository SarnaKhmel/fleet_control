import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isLanguage, setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useThemeStore } from '../theme/themeStore';
import { useMapViewStore, type MapView } from '../map/mapStyles';
import { loadFrontLine, useFrontLineStore } from '../frontline/frontLine';
import { useSymbolStyleStore, type SymbolStyle } from '../mission/symbolStyle';
import { Accordion } from '../sidebar/Accordion';
import { useSettingsPanelStore } from '../settings/settingsStore';

// Right-side settings panel, laid out like the left side panel: accordion sections over the map.
export function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const open = useSettingsPanelStore((state) => state.open);
  const setOpen = useSettingsPanelStore((state) => state.setOpen);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const mapView = useMapViewStore((state) => state.view);
  const setMapView = useMapViewStore((state) => state.setView);
  const buildings3d = useMapViewStore((state) => state.buildings3d);
  const setBuildings3d = useMapViewStore((state) => state.setBuildings3d);
  const frontEnabled = useFrontLineStore((state) => state.enabled);
  const setFrontEnabled = useFrontLineStore((state) => state.setEnabled);
  const symbolStyle = useSymbolStyleStore((state) => state.style);
  const setSymbolStyle = useSymbolStyleStore((state) => state.setStyle);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <aside className="sidebar sidebar-right" aria-label={t('settings.title')}>
      <div className="sidebar-top">
        <span className="sidebar-title">{t('settings.title')}</span>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={t('settings.close')}
          title={t('settings.close')}
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>

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
        <div className="settings-row">
          <span>{t('settings.theme')}</span>
          <button type="button" onClick={toggleTheme}>
            {t(theme === 'dark' ? 'header.switchToLight' : 'header.switchToDark')}
          </button>
        </div>
      </Accordion>

      <Accordion title={t('settings.map')}>
        <label className="settings-row">
          <span>{t('header.mapView')}</span>
          <select aria-label={t('header.mapView')} value={mapView} onChange={(event) => setMapView(event.target.value as MapView)}>
            <option value="auto">{t('header.mapAuto')}</option>
            <option value="landscape">{t('header.mapLandscape')}</option>
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
    </aside>
  );
}
