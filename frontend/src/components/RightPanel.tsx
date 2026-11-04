import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsPanelStore } from '../settings/settingsStore';
import { useSelectionStore } from '../mission/selection';
import { useMissionStore } from '../mission/missionStore';
import { DroneDetails } from '../drones/DroneDetails';

// One selected drone. It subscribes to that drone only, so other drones' updates do not re-render it.
function SelectedDrone({ droneId, defaultOpen }: { droneId: string; defaultOpen: boolean }) {
  const drone = useMissionStore((state) => state.drones[droneId]);
  return <DroneDetails droneId={droneId} drone={drone} defaultOpen={defaultOpen} />;
}
import { SettingsSections } from './SettingsSections';

// Right-side panel, laid out like the left one: drone details when drones are selected,
// and settings when the gear is open. Each drone is a collapsible section.
export function RightPanel() {
  const { t } = useTranslation();
  const settingsOpen = useSettingsPanelStore((state) => state.open);
  const setSettingsOpen = useSettingsPanelStore((state) => state.setOpen);
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const clearSelection = useSelectionStore((state) => state.clear);
  const visible = settingsOpen || selectedIds.length > 0;

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, setSettingsOpen, clearSelection]);

  if (!visible) return null;

  const title = selectedIds.length > 0 ? t('drone.panelTitle') : t('settings.title');
  return (
    <aside className="sidebar sidebar-right" aria-label={title}>
      <div className="sidebar-top">
        <span className="sidebar-title">{title}</span>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={t('settings.close')}
          title={t('settings.close')}
          onClick={() => {
            setSettingsOpen(false);
            clearSelection();
          }}
        >
          ×
        </button>
      </div>
      {selectedIds.map((id) => (
        <SelectedDrone key={id} droneId={id} defaultOpen={selectedIds.length === 1} />
      ))}
      {settingsOpen && <SettingsSections />}
    </aside>
  );
}
