import { DRONE_COUNT, GROUND_AMSL_M } from '../../../shared/protocol';
import { useTranslation } from 'react-i18next';
import { useMissionStore, type DroneView, type MissionPhase } from './missionStore';
import { sendRouteToSelected } from './missionSocket';
import { useSelectionStore } from './selection';

interface DroneStatusListProps {
  drones: Record<string, DroneView>;
  phase: MissionPhase;
}

// Boot progress and connection state of the three drones, always visible while a mission is in play.
export function DroneStatusList({ drones, phase }: DroneStatusListProps) {
  const { t } = useTranslation();
  const rows = Array.from({ length: DRONE_COUNT }, (_, i) => {
    const id = `drone-${i + 1}`;
    // The callsign is fixed by the schedule (BA-01…BA-03); the drone is only a status until it is online.
    const drone = drones[id];
    return { id, callsign: `BA-0${i + 1}`, status: drone?.status ?? null, progress: drone?.progress ?? 0, altitudeM: drone?.altitudeM ?? null };
  });
  const online = rows.filter((r) => r.status === 'idle').length;
  // Drones exist only while a mission runs; before the start or after a reset the list is hidden.
  if (phase !== 'running') return null;
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

// Drone commands: status, move to a point and control-point routes. Kept apart from the mission settings,
// so they stay available while the mission runs.
export function DroneControls() {
  const { t } = useTranslation();
  const state = useMissionStore();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  return (
    <div className="drone-controls">
      <DroneStatusList drones={state.drones} phase={state.phase} />
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
