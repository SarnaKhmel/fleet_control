import { DRONE_COUNT, GROUND_AMSL_M } from '../../../shared/protocol';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useMissionStore } from './missionStore';
import { sendRouteToSelected } from './missionSocket';
import { useSelectionStore } from './selection';

const DRONE_IDS = Array.from({ length: DRONE_COUNT }, (_, i) => `drone-${i + 1}`);

// One drone's boot progress and state. It subscribes only to what it shows (height rounded to a meter),
// so position updates do not re-render it.
function DroneStatusRow({ droneId, index }: { droneId: string; index: number }) {
  const { t } = useTranslation();
  const status = useMissionStore((s) => s.drones[droneId]?.status ?? null);
  const bootProgress = useMissionStore((s) => s.drones[droneId]?.progress ?? 0);
  const heightM = useMissionStore((s) => {
    const altitudeM = s.drones[droneId]?.altitudeM;
    return altitudeM == null ? null : Math.round(altitudeM - GROUND_AMSL_M);
  });
  const progress = status === 'idle' ? 100 : status ? bootProgress : 0;
  return (
    <li>
      <div className="drone-status-line">
        {/* The callsign is fixed by the schedule (BA-01…BA-03); the drone is only a status until it is online. */}
        <strong>{`BA-0${index + 1}`}</strong>
        <span className={`drone-state is-${status ?? 'offline'}`}>
          {status === 'idle' && heightM !== null ? `${heightM} m` : status ? t(`mission.status.${status}`) : t('mission.status.offline')}
        </span>
      </div>
      <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
    </li>
  );
}

// Boot progress and connection state of the three drones, always visible while a mission is in play.
export function DroneStatusList() {
  const { t } = useTranslation();
  const phase = useMissionStore((s) => s.phase);
  const online = useMissionStore((s) => Object.values(s.drones).filter((d) => d.status === 'idle').length);
  // Drones exist only while a mission runs; before the start or after a reset the list is hidden.
  if (phase !== 'running') return null;
  return (
    <section className="drone-status" aria-label={t('mission.drones')}>
      <div className="drone-status-head">
        <span>{t('mission.drones')}</span>
        <span className="drone-status-count">{t('mission.online', { count: online, total: DRONE_COUNT })}</span>
      </div>
      <ul>
        {DRONE_IDS.map((id, index) => (
          <DroneStatusRow key={id} droneId={id} index={index} />
        ))}
      </ul>
    </section>
  );
}

// Drone commands: status, move to a point and control-point routes. Kept apart from the mission settings,
// so they stay available while the mission runs.
export function DroneControls() {
  const { t } = useTranslation();
  // Only the command fields: drone updates must not re-render the controls.
  const state = useMissionStore(
    useShallow((s) => ({
      phase: s.phase,
      moveMode: s.moveMode,
      routeMode: s.routeMode,
      routePoints: s.routePoints,
      setMoveMode: s.setMoveMode,
      setRouteMode: s.setRouteMode,
      clearRoute: s.clearRoute,
    })),
  );
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  return (
    <div className="drone-controls">
      <DroneStatusList />
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

        <fieldset>
          <legend>{t('mission.route')}</legend>
          <button
            type="button"
            aria-pressed={state.routeMode}
            disabled={state.phase !== 'running'}
            onClick={() => state.setRouteMode(!state.routeMode)}
          >
            {state.routeMode ? t('mission.routeOn') : t('mission.routeAdd')}
          </button>
          <span className="muted">{t('mission.routePoints', { count: state.routePoints.length })}</span>
          <button
            type="button"
            disabled={state.routePoints.length === 0 || state.phase !== 'running' || selectedIds.length === 0}
            onClick={() => {
              // The route goes to the selected drones; without a selection nothing is sent and the points stay.
              if (sendRouteToSelected(state.routePoints) > 0) {
                state.clearRoute();
                state.setRouteMode(false);
              }
            }}
          >
            {t('mission.routeSend')}
          </button>
          {selectedIds.length === 0 && <p className="muted">{t('mission.routeSelectFirst')}</p>}
          <button type="button" onClick={state.clearRoute} disabled={state.routePoints.length === 0}>
            {t('mission.routeClear')}
          </button>
        </fieldset>


    </div>
  );
}
