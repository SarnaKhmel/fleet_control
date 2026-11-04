import { useTranslation } from 'react-i18next';
import { fitMissionZone } from './zoneView';
import { useMissionStore } from './missionStore';

// Shown over the map when the mission zone is off screen; brings the zone back into view.
export function ZoneReturnButton() {
  const { t } = useTranslation();
  const visible = useMissionStore((state) => state.zoneVisible);
  if (visible) return null;
  return (
    <button type="button" className="zone-return" onClick={fitMissionZone}>
      {t('mission.backToZone')}
    </button>
  );
}
