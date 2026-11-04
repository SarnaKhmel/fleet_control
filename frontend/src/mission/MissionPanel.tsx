import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DRONE_COUNT, type ClientMessage } from '../../../shared/protocol';
import { useLocationStore } from '../location/locationStore';
import { sendClientMessage } from './missionSocket';
import { effectiveCenter, layoutFrom, startProblem, useMissionStore, type LayoutKind } from './missionStore';

export function MissionPanel() {
  const { t } = useTranslation();
  const state = useMissionStore();
  const selected = useLocationStore((s) => s.selected);
  const [notice, setNotice] = useState<string | null>(null);

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

  function start() {
    const layout = layoutFrom(state);
    if (!layout) return;
    const area = { center: effectiveCenter(state), widthKm: state.widthKm, heightKm: state.heightKm };
    if (send({ type: 'mission_start', area, layout })) state.markStarting();
  }

  const drones = Object.entries(state.drones);

  return (
    <div className="mission-panel">

      <fieldset>
        <legend>{t('mission.area')}</legend>
        <button type="button" aria-pressed={state.drawing} onClick={() => state.setDrawing(!state.drawing)}>
          {state.drawing ? t('mission.drawingOn') : t('mission.draw')}
        </button>
        {state.drawing && (
          <span className="muted">{state.drawAnchor ? t('mission.drawSecond') : t('mission.drawFirst')}</span>
        )}
        <label>
          {t('mission.width')}
          <input type="number" min={1} max={500} value={state.widthKm} onChange={(e) => state.setSize(Number(e.target.value), state.heightKm)} />
        </label>
        <label>
          {t('mission.height')}
          <input type="number" min={1} max={500} value={state.heightKm} onChange={(e) => state.setSize(state.widthKm, Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => state.setCenter(selected)} disabled={!selected}>
          {t('mission.useLocation')}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t('mission.layout')}</legend>
        <select value={state.layoutKind} onChange={(e) => state.setLayoutKind(e.target.value as LayoutKind)}>
          <option value="single">{t('mission.layoutSingle')}</option>
          <option value="cluster">{t('mission.layoutCluster')}</option>
          <option value="separate">{t('mission.layoutSeparate')}</option>
        </select>
        {state.layoutKind === 'cluster' && (
          <label>
            {t('mission.radius')}
            <input type="number" min={1} max={5000} value={state.clusterRadiusM} onChange={(e) => state.setClusterRadius(Number(e.target.value))} />
          </label>
        )}
        <button type="button" aria-pressed={state.picking} onClick={() => state.setPicking(!state.picking)}>
          {state.picking ? t('mission.pickingOn') : t('mission.pick')}
        </button>
        <span className="muted">
          {t('mission.picked', { count: state.points.length, need })}
        </span>
        <button type="button" onClick={state.clearPoints} disabled={state.points.length === 0}>
          {t('mission.clearPoints')}
        </button>
      </fieldset>

      <div className="mission-actions">
        <button type="button" className="btn-primary" onClick={start} disabled={!canStart}>
          {t('mission.start')}
        </button>
        <button type="button" onClick={() => send({ type: 'mission_reset' })}>
          {t('mission.reset')}
        </button>
      </div>

      {problem && state.phase === 'idle' && <p className="muted">{t(`mission.problem.${problem}`)}</p>}
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

      {drones.length > 0 && (
        <ul className="roster">
          {drones.map(([id, d]) => (
            <li key={id}>
              <strong>{d.callsign}</strong> {t(`mission.status.${d.status}`)} {d.status === 'booting' ? `${d.progress}%` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
