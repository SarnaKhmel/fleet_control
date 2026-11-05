import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { MAX_DRONES, type ClientMessage } from '../../../shared/protocol';
import { useLocationStore } from '../location/locationStore';
import { sendClientMessage } from './missionSocket';
import { effectiveCenter, layoutFrom, startProblem, useMissionStore, type LayoutKind } from './missionStore';
import { BattleSettings } from './BattleSettings';
import { MissionClock } from './MissionClock';

export function MissionPanel() {
  const { t } = useTranslation();
  // Only the setup fields: drone updates arrive many times a second and must not re-render the panel.
  const state = useMissionStore(
    useShallow((s) => ({
      center: s.center,
      widthKm: s.widthKm,
      heightKm: s.heightKm,
      layoutKind: s.layoutKind,
      points: s.points,
      clusterRadiusM: s.clusterRadiusM,
      droneCount: s.droneCount,
      odds: s.odds,
      enemyCounts: s.enemyCounts,
      allyCounts: s.allyCounts,
      placed: s.placed,
      picking: s.picking,
      drawing: s.drawing,
      drawAnchor: s.drawAnchor,
      phase: s.phase,
      error: s.error,
      setCenter: s.setCenter,
      setSize: s.setSize,
      setLayoutKind: s.setLayoutKind,
      setClusterRadius: s.setClusterRadius,
      setDroneCount: s.setDroneCount,
      setPicking: s.setPicking,
      setDrawing: s.setDrawing,
      clearPoints: s.clearPoints,
      markStarting: s.markStarting,
    })),
  );
  const selected = useLocationStore((s) => s.selected);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const locked = state.phase === 'running';

  const need = state.layoutKind === 'separate' ? state.droneCount : 1;
  const problem = startProblem(state);
  const canStart = state.phase === 'idle' && problem === null;

  function send(message: ClientMessage) {
    if (!sendClientMessage(message)) {
      setNotice(t('mission.notConnected'));
      return false;
    }
    setNotice(null);
    return true;
  }

  // Resetting a running mission needs a second press within a few seconds.
  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  function resetMission() {
    if (locked && !confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    send({ type: 'mission_reset' });
  }

  function start() {
    const layout = layoutFrom(state);
    if (!layout) return;
    const area = { center: effectiveCenter(state), widthKm: state.widthKm, heightKm: state.heightKm };
    const composition = { enemy: state.enemyCounts, ally: state.allyCounts, placed: state.placed };
    if (send({ type: 'mission_start', area, layout, droneCount: state.droneCount, odds: state.odds, composition })) state.markStarting();
  }


  return (
    <div className="mission-panel">

      <MissionClock />

      <fieldset>
        <legend>{t('mission.area')}</legend>
        <button type="button" aria-pressed={state.drawing} disabled={locked} onClick={() => state.setDrawing(!state.drawing)}>
          {state.drawing ? t('mission.drawingOn') : t('mission.draw')}
        </button>
        {state.drawing && (
          <span className="muted">{state.drawAnchor ? t('mission.drawSecond') : t('mission.drawFirst')}</span>
        )}
        <label>
          {t('mission.width')}
          <input type="number" min={1} max={500} disabled={locked} value={state.widthKm} onChange={(e) => state.setSize(Number(e.target.value), state.heightKm)} />
        </label>
        <label>
          {t('mission.height')}
          <input type="number" min={1} max={500} disabled={locked} value={state.heightKm} onChange={(e) => state.setSize(state.widthKm, Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => state.setCenter(selected)} disabled={!selected || locked}>
          {t('mission.useLocation')}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t('mission.layout')}</legend>
        <label>
          {t('mission.droneCount')}
          <input type="number" min={1} max={MAX_DRONES} disabled={locked} value={state.droneCount} onChange={(e) => state.setDroneCount(Number(e.target.value))} />
        </label>
        <select value={state.layoutKind} disabled={locked} onChange={(e) => state.setLayoutKind(e.target.value as LayoutKind)}>
          <option value="single">{t('mission.layoutSingle')}</option>
          <option value="cluster">{t('mission.layoutCluster')}</option>
          <option value="separate">{t('mission.layoutSeparate')}</option>
        </select>
        {state.layoutKind === 'cluster' && (
          <label>
            {t('mission.radius')}
            <input type="number" min={1} max={5000} disabled={locked} value={state.clusterRadiusM} onChange={(e) => state.setClusterRadius(Number(e.target.value))} />
          </label>
        )}
        <button type="button" aria-pressed={state.picking} disabled={locked} onClick={() => state.setPicking(!state.picking)}>
          {state.picking ? t('mission.pickingOn') : t('mission.pick')}
        </button>
        <span className="muted">
          {t('mission.picked', { count: state.points.length, need })}
        </span>
        <button type="button" onClick={state.clearPoints} disabled={state.points.length === 0 || locked}>
          {t('mission.clearPoints')}
        </button>
      </fieldset>

      <div className="mission-actions">
        <button type="button" aria-label={t('mission.settings.open')} title={t('mission.settings.open')} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
          ⚙
        </button>
        <button type="button" className="btn-primary" onClick={start} disabled={!canStart}>
          {t('mission.start')}
        </button>
        <button type="button" className={confirmReset ? 'btn-danger' : undefined} onClick={resetMission}>
          {confirmReset ? t('mission.resetConfirm') : t('mission.reset')}
        </button>
      </div>

      {problem && state.phase === 'idle' && <p className="muted">{t(`mission.problem.${problem}`)}</p>}
      {locked && <p className="muted">{t('mission.locked')}</p>}
      {settingsOpen && <BattleSettings onClose={() => setSettingsOpen(false)} />}
      {state.error && (
        <p role="alert" className="form-error">
          {t(`mission.error.${state.error}`)}
        </p>
      )}
      {notice && (
        <p role="alert" className="form-error">
          {notice}
        </p>
      )}

    </div>
  );
}
