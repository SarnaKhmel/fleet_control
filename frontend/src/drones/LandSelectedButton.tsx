import { useTranslation } from 'react-i18next';
import { useMissionStore } from '../mission/missionStore';
import { landableSelected, landSelectedDrones } from '../mission/missionSocket';
import { useSelectionStore } from '../mission/selection';

/**
 * Lands the selected drones that are in the air, one or a whole group. It subscribes to a count only,
 * so position updates do not re-render it; hidden when none of the selected drones can land.
 */
export function LandSelectedButton() {
  const { t } = useTranslation();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const count = useMissionStore((s) => landableSelected(s.drones, selectedIds).length);
  if (count === 0) return null;
  return (
    <button type="button" className="land-selected" title={t('drone.landHint')} onClick={landSelectedDrones}>
      {t('drone.land', { count })}
    </button>
  );
}
