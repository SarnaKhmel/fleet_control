import { callsignOf, droneIdOf, isAirborne, takesCommands } from '../../../shared/protocol';
import { useTranslation } from 'react-i18next';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';

// One drone's boot progress and state. It subscribes only to what it shows (height rounded to a meter),
// so position updates do not re-render it. Clicking the row selects the drone, which opens its details
// and shows its path; Shift+click adds it to the selection or takes it out.
function DroneStatusRow({ droneId, index }: { droneId: string; index: number }) {
  const { t } = useTranslation();
  const selected = useSelectionStore((s) => s.selectedIds.includes(droneId));
  const status = useMissionStore((s) => s.drones[droneId]?.status ?? null);
  const bootProgress = useMissionStore((s) => s.drones[droneId]?.progress ?? 0);
  // Height above the ground under the drone, which follows the terrain.
  const heightM = useMissionStore((s) => {
    const drone = s.drones[droneId];
    return drone?.altitudeM == null || drone.groundM == null ? null : Math.round(drone.altitudeM - drone.groundM);
  });
  const online = status !== null && status !== 'booting' && status !== 'connecting';
  const progress = online ? 100 : status ? bootProgress : 0;
  const label = status ? t(`mission.status.${status}`) : t('mission.status.offline');
  return (
    <li>
      <button
        type="button"
        className={`drone-status-select${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={(event) => {
          if (event.shiftKey) useSelectionStore.getState().toggle(droneId);
          else useSelectionStore.getState().select([droneId]);
        }}
      >
        <div className="drone-status-line">
          {/* The callsign is fixed by the schedule (BA-01, BA-02, …); the drone is only a status until it is online. */}
          <strong>{callsignOf(index)}</strong>
          <span className={`drone-state is-${status ?? 'offline'}`}>
            {isAirborne(status) && heightM !== null ? `${label} · ${heightM} m` : label}
          </span>
        </div>
        <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </button>
    </li>
  );
}

// Boot progress and connection state of every drone of the mission, always visible while it is in play.
export function DroneStatusList() {
  const { t } = useTranslation();
  const phase = useMissionStore((s) => s.phase);
  const droneCount = useMissionStore((s) => s.droneCount);
  // Online: the drones that still take commands, in the air or on the ground.
  const online = useMissionStore((s) => Object.values(s.drones).filter((d) => takesCommands(d.status)).length);
  // Drones exist only while a mission runs; before the start or after a reset the list is hidden.
  if (phase !== 'running') return null;
  return (
    <section className="drone-status" aria-label={t('mission.drones')}>
      <div className="drone-status-head">
        <span>{t('mission.drones')}</span>
        <span className="drone-status-count">{t('mission.online', { count: online, total: droneCount })}</span>
      </div>
      <ul>
        {Array.from({ length: droneCount }, (_, index) => (
          <DroneStatusRow key={index} droneId={droneIdOf(index)} index={index} />
        ))}
      </ul>
      <p className="muted drone-status-hint">{t('mission.selectHint')}</p>
    </section>
  );
}

// Drone section of the sidebar: the status list, kept apart from the mission settings so it stays
// available while the mission runs. Drones are commanded on the map: select them, then click.
export function DroneControls() {
  return (
    <div className="drone-controls">
      <DroneStatusList />
    </div>
  );
}
