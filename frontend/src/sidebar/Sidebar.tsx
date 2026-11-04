import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WindCompass } from '../wind/WindCompass';
import { MissionPanel } from '../mission/MissionPanel';
import { LocationPanel } from '../location/LocationPanel';
import { formatLatLng, useLocationStore } from '../location/locationStore';
import { ViewResetButton } from '../map/ViewResetButton';
import { Accordion } from './Accordion';

// Left-edge panel: wind, mission and location as accordions, with a collapse toggle.
export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const selected = useLocationStore((state) => state.selected);

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label={t('sidebar.label')}>
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '›' : '‹'}
        </button>
        <ViewResetButton />
      </div>
      {!collapsed && (
        <>
          <Accordion title={t('sidebar.wind')} defaultOpen>
            <WindCompass />
          </Accordion>
          <Accordion title={t('sidebar.mission')}>
            <MissionPanel />
          </Accordion>
          <Accordion title={t('sidebar.location')} summary={selected ? formatLatLng(selected) : undefined}>
            <LocationPanel />
          </Accordion>
        </>
      )}
    </aside>
  );
}
