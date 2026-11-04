import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DRONE_COUNT, GROUND_AMSL_M, type ClientMessage } from '../../../shared/protocol';
import { useLocationStore } from '../location/locationStore';
import { sendClientMessage } from './missionSocket';
import { effectiveCenter, layoutFrom, startProblem, useMissionStore, type DroneView, type LayoutKind, type MissionPhase } from './missionStore';

interface DroneStatusListProps {
  drones: Record<string, DroneView>;
  phase: MissionPhase;
}

// Boot progress and connection state of the three drones, always visible while a mission is in play.
function DroneStatusList({ drones, phase }: DroneStatusListProps) {
  const { t } = useTranslation();
  const rows = Array.from({ length: DRONE_COUNT }, (_, i) => {
    const id = `drone-${i + 1}`;
    // The callsign is fixed by the schedule (BA-01…BA-03); the drone is only a status until it is online.
    const drone = drones[id];
    return { id, callsign: `BA-0${i + 1}`, status: drone?.status ?? null, progress: drone?.progress ?? 0, altitudeM: drone?.altitudeM ?? null };
  });
  const online = rows.filter((r) => r.status === 'idle').length;
  if (phase !== 'running' && online === 0) return null;
  return (
    <section className="drone-status" aria-label={t('mission.drones')}>
      <div className="drone-status-head">
        <span>{t('mission.drones')}</span>
        <span className="drone-status-count">{t('mission.online', { count: online, total: DRONE_COUNT })}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const progress = row.status === 'idle' ? 100 : row.status ? row.progress : 0;
          return (
            <li key={row.id}>
              <div className="drone-status-line">
                <strong>{row.callsign}</strong>
                <span className={`drone-state is-${row.status ?? 'offline'}`}>
                  {row.status === 'idle' && row.altitudeM !== null
                    ? `${Math.round(row.altitudeM - GROUND_AMSL_M)} m`
                    : row.status
                      ? t(`mission.status.${row.status}`)
                      : t('mission.status.offline')}
                </span>
              </div>
              <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MissionPanel() {
  const { t } = useTranslation();
  const state = useMissionStore();
  const selected = useLocationStore((s) => s.selected);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const locked = state.phase === 'running';

  const need = state.layoutKind === 'separate' ? DRONE_COUNT : 1;
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
    if (send({ type: 'mission_start', area, layout })) state.markStarting();
  }


  return (
    <div className="mission-panel">

      <DroneStatusList drones={state.drones} phase={state.phase} />

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

      <fieldset>
        <legend>{t('mission.drones')}</legend>
        <button
          type="button"
          aria-pressed={state.moveMode}
          disabled={state.phase !== 'running'}
          onClick={() => state.setMoveMode(!state.moveMode)}
        >
          {state.moveMode ? t('mission.moveOn') : t('mission.move')}
        </button>
      </fieldset>

      <div className="mission-actions">
        <button type="button" className="btn-primary" onClick={start} disabled={!canStart}>
          {t('mission.start')}
        </button>
        <button type="button" className={confirmReset ? 'btn-danger' : undefined} onClick={resetMission}>
          {confirmReset ? t('mission.resetConfirm') : t('mission.reset')}
        </button>
      </div>

      {problem && state.phase === 'idle' && <p className="muted">{t(`mission.problem.${problem}`)}</p>}
      {locked && <p className="muted">{t('mission.locked')}</p>}
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
