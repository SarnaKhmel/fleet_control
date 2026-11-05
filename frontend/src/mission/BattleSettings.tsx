import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { UNIT_KINDS, type UnitKind, type UnitSide } from '../../../shared/mission/units';
import type { MissionOdds, StrikeOdds } from '../../../shared/mission/odds';
import { MAX_UNITS_PER_KIND } from '../../../shared/mission/composition';
import { placedOf, useMissionStore } from './missionStore';

const toPercent = (share: number) => Math.round(share * 100);
const toShare = (percent: number) => Math.min(100, Math.max(0, Math.round(percent))) / 100;

/** A strike's odds with one share changed; the other one is cut back so the two add up to at most 100%. */
function withStrike(strike: StrikeOdds, field: keyof StrikeOdds, share: number): StrikeOdds {
  const next = { ...strike, [field]: share };
  const other: keyof StrikeOdds = field === 'destroyed' ? 'damaged' : 'destroyed';
  next[other] = Math.min(next[other], 1 - share);
  return next;
}

/**
 * The battle settings: the odds of strikes, the units each side has by kind, and the units placed on the map
 * by hand. A modal over the map, but the map stays clickable: the operator places units on it from here.
 * Everything is fixed once the mission runs.
 */
export function BattleSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const s = useMissionStore(
    useShallow((state) => ({
      odds: state.odds,
      enemyCounts: state.enemyCounts,
      allyCounts: state.allyCounts,
      placed: state.placed,
      placing: state.placing,
      phase: state.phase,
      setOdds: state.setOdds,
      setCount: state.setCount,
      setPlacing: state.setPlacing,
      removePlaced: state.removePlaced,
    })),
  );
  const locked = s.phase === 'running';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setOdds = (next: Partial<MissionOdds>) => s.setOdds({ ...s.odds, ...next });

  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="battle-settings-title" className="modal">
        <h2 id="battle-settings-title">{t('mission.settings.title')}</h2>
        {locked && <p className="muted">{t('mission.settings.locked')}</p>}

        <fieldset>
          <legend>{t('mission.settings.odds')}</legend>
          <label>
            {t('mission.settings.vehicleDestroyed')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.vehicle.destroyed)}
              onChange={(e) => setOdds({ vehicle: withStrike(s.odds.vehicle, 'destroyed', toShare(Number(e.target.value))) })} />
          </label>
          <label>
            {t('mission.settings.vehicleDamaged')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.vehicle.damaged)}
              onChange={(e) => setOdds({ vehicle: withStrike(s.odds.vehicle, 'damaged', toShare(Number(e.target.value))) })} />
          </label>
          <label>
            {t('mission.settings.infantryDestroyed')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.infantry.destroyed)}
              onChange={(e) => setOdds({ infantry: withStrike(s.odds.infantry, 'destroyed', toShare(Number(e.target.value))) })} />
          </label>
          <label>
            {t('mission.settings.infantryDamaged')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.infantry.damaged)}
              onChange={(e) => setOdds({ infantry: withStrike(s.odds.infantry, 'damaged', toShare(Number(e.target.value))) })} />
          </label>
          <label>
            {t('mission.settings.infantryShootsDown')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.infantryShootsDown)}
              onChange={(e) => setOdds({ infantryShootsDown: toShare(Number(e.target.value)) })} />
          </label>
          <label>
            {t('mission.settings.movingShare')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.movingShare)}
              onChange={(e) => setOdds({ movingShare: toShare(Number(e.target.value)) })} />
          </label>
          <label>
            {t('mission.settings.knownShare')}
            <input type="number" min={0} max={100} disabled={locked} value={toPercent(s.odds.knownShare)}
              onChange={(e) => setOdds({ knownShare: toShare(Number(e.target.value)) })} />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('mission.settings.units')}</legend>
          <table className="battle-units">
            <thead>
              <tr>
                <th scope="col">{t('mission.settings.kind')}</th>
                <th scope="col">{t('unit.side.enemy')}</th>
                <th scope="col">{t('unit.side.ally')}</th>
              </tr>
            </thead>
            <tbody>
              {UNIT_KINDS.map((kind) => (
                <tr key={kind}>
                  <th scope="row">{t(`unit.kind.${kind}`)}</th>
                  <td>
                    <UnitCell side="enemy" kind={kind} />
                  </td>
                  <td>
                    <UnitCell side="ally" kind={kind} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.placing && <p className="muted">{t('mission.settings.placingHint', { side: t(`unit.side.${s.placing.side}`), kind: t(`unit.kind.${s.placing.kind}`) })}</p>}
        </fieldset>

        <fieldset>
          <legend>{t('mission.settings.placedTitle')}</legend>
          {s.placed.length === 0 ? (
            <p className="muted">{t('mission.settings.placedNone')}</p>
          ) : (
            <ol>
              {s.placed.map((unit, index) => (
                <li key={`${index}-${unit.position.lat}-${unit.position.lng}`}>
                  <span>{`${t(`unit.side.${unit.side}`)}: ${t(`unit.kind.${unit.kind}`)} · ${unit.position.lat.toFixed(4)}, ${unit.position.lng.toFixed(4)}`}</span>
                  <button type="button" disabled={locked} aria-label={t('mission.settings.remove')} onClick={() => s.removePlaced(index)}>
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('mission.settings.close')}
          </button>
        </div>
      </div>
    </div>
  );

  /** One side's count of a kind, and the button that places them on the map by hand. */
  function UnitCell({ side, kind }: { side: UnitSide; kind: UnitKind }) {
    const count = side === 'enemy' ? s.enemyCounts[kind] : s.allyCounts[kind];
    const placing = s.placing?.side === side && s.placing.kind === kind;
    const placedHere = placedOf(s.placed, side, kind);
    return (
      <>
        <label className="sr-only" htmlFor={`count-${side}-${kind}`}>
          {`${t(`unit.side.${side}`)}: ${t(`unit.kind.${kind}`)}`}
        </label>
        <input
          id={`count-${side}-${kind}`}
          type="number"
          min={placedHere}
          max={MAX_UNITS_PER_KIND}
          disabled={locked}
          value={count}
          onChange={(e) => s.setCount(side, kind, Number(e.target.value))}
        />
        <button type="button" disabled={locked} aria-pressed={placing} onClick={() => s.setPlacing(placing ? null : { side, kind })}>
          {placing ? t('mission.settings.stopPlacing') : t('mission.settings.place')}
        </button>
        {placedHere > 0 && <span className="muted">{t('mission.settings.placedCount', { count: placedHere })}</span>}
      </>
    );
  }
}
