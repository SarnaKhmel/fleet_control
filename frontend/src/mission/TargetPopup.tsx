import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EngageMode } from '../../../shared/protocol';
import { useMissionStore } from './missionStore';
import { commandableSelected, engageEnemy } from './missionSocket';
import { useSelectionStore } from './selection';
import { useTargetPickStore } from './targetPickStore';

/**
 * The pop-up at the cursor after a click on an enemy unit: strike or pursue it with the selected drones.
 * The server refuses what it cannot do (a pursuit out of camera range, a unit not known) without a message.
 */
export function TargetPopup() {
  const { t } = useTranslation();
  const pick = useTargetPickStore((s) => s.pick);
  const close = useTargetPickStore((s) => s.close);
  const unit = useMissionStore((s) => (pick ? s.units[pick.unitId] : undefined));
  const [notice, setNotice] = useState<string | null>(null);

  // A new pick starts without the notice of the last one.
  useEffect(() => setNotice(null), [pick]);
  useEffect(() => {
    if (!pick) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, close]);

  if (!pick || !unit) return null;

  function engage(mode: EngageMode) {
    // Read at the click, not on render: drone positions change many times a second.
    const ids = commandableSelected(useMissionStore.getState().drones, useSelectionStore.getState().selectedIds);
    if (ids.length === 0) {
      setNotice(t('map.target.noDrone'));
      return;
    }
    for (const id of ids) engageEnemy(id, unit!.id, mode);
    close();
  }

  return (
    <div role="dialog" aria-label={t('map.target.title')} className="target-popup" style={{ left: pick.x + 12, top: pick.y + 12 }}>
      <strong>{`${unit.id} · ${t(`unit.kind.${unit.kind}`)}`}</strong>
      <button type="button" onClick={() => engage('strike')}>
        {t('map.target.strike')}
      </button>
      <button type="button" onClick={() => engage('pursuit')}>
        {t('map.target.pursuit')}
      </button>
      <button type="button" aria-label={t('map.target.close')} onClick={close}>
        ×
      </button>
      {notice && (
        <p role="alert" className="muted">
          {notice}
        </p>
      )}
    </div>
  );
}
