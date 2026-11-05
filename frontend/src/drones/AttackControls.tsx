import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EngageMode } from '../../../shared/protocol';
import { useMissionStore } from '../mission/missionStore';
import { engageEnemy } from '../mission/missionSocket';

/**
 * Sends the drone at an enemy unit it knows: a strike (flies into it) or a pursuit (keeps behind or around it).
 * The server refuses what it cannot do (a pursuit out of camera range, an unknown unit), without a message.
 */
export function AttackControls({ droneId }: { droneId: string }) {
  const { t } = useTranslation();
  const units = useMissionStore((s) => s.units);
  const enemies = useMemo(() => Object.values(units).filter((u) => u.side === 'enemy'), [units]);
  const [picked, setPicked] = useState('');
  const [mode, setMode] = useState<EngageMode>('strike');
  // The chosen unit, while it is still known; otherwise the first known one.
  const targetId = enemies.some((u) => u.id === picked) ? picked : (enemies[0]?.id ?? '');

  return (
    <section className="drone-attack" aria-label={t('drone.attack.title')}>
      <h4>{t('drone.attack.title')}</h4>
      {enemies.length === 0 ? (
        <p className="muted">{t('drone.attack.none')}</p>
      ) : (
        <>
          <label>
            {t('drone.attack.target')}
            <select value={targetId} onChange={(event) => setPicked(event.target.value)}>
              {enemies.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {`${unit.id} · ${t(`unit.kind.${unit.kind}`)}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('drone.attack.mode')}
            <select value={mode} onChange={(event) => setMode(event.target.value as EngageMode)}>
              <option value="strike">{t('drone.attack.strike')}</option>
              <option value="pursuit">{t('drone.attack.pursuit')}</option>
            </select>
          </label>
          <button type="button" onClick={() => engageEnemy(droneId, targetId, mode)}>
            {t('drone.attack.go')}
          </button>
        </>
      )}
    </section>
  );
}
