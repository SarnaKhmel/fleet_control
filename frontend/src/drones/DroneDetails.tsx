import { useTranslation } from 'react-i18next';
import { GROUND_AMSL_M, takesCommands } from '../../../shared/protocol';
import { Accordion } from '../sidebar/Accordion';
import { batteryLevel } from '../mission/battery';
import type { DroneView } from '../mission/missionStore';
import { clearDroneTasks, removeDroneTask } from '../mission/missionSocket';

interface DroneDetailsProps {
  droneId: string;
  drone: DroneView | undefined;
  defaultOpen: boolean;
}

/**
 * The warning to highlight for the drone: destroyed or lost link, else a low or critical battery;
 * null when all is well.
 */
function droneAlert(drone: DroneView | undefined): 'destroyed' | 'lost' | 'low' | 'critical' | null {
  if (drone?.status === 'destroyed') return 'destroyed';
  if (drone?.status === 'lost_link') return 'lost';
  if (!drone || !takesCommands(drone.status)) return null;
  const level = batteryLevel(drone.batteryPct);
  return level === 'ok' ? null : level;
}

/** One drone as a collapsible section: summary in the header, telemetry inside. */
export function DroneDetails({ droneId, drone, defaultOpen }: DroneDetailsProps) {
  const { t } = useTranslation();
  const callsign = drone?.callsign ?? droneId;
  const online = takesCommands(drone?.status) && drone?.altitudeM != null;
  const altitude = online ? `${Math.round(drone!.altitudeM! - GROUND_AMSL_M)} m` : '—';
  const battery = drone ? `${Math.round(drone.batteryPct)}%` : '—';
  const status = drone?.status ? t(`mission.status.${drone.status}`) : t('mission.status.offline');
  // A drone that is out (lost link, destroyed) lies where it came down: its spot and unfinished route stay on view.
  const lost = drone?.status === 'lost_link' || drone?.status === 'destroyed';
  const alert = droneAlert(drone);

  return (
    <Accordion title={callsign} summary={`${altitude} · ${battery}`} defaultOpen={defaultOpen}>
      {alert && (
        <p role="alert" className={`drone-alert is-${alert}`}>
          {t(`drone.alert.${alert}`, { pct: Math.round(drone!.batteryPct) })}
        </p>
      )}
      <dl className="drone-facts">
        <dt>{t('drone.status')}</dt>
        <dd>{status}</dd>
        <dt>{t('drone.altitude')}</dt>
        <dd>{altitude}</dd>
        <dt>{t('drone.heading')}</dt>
        <dd>{online && drone?.heading !== null ? `${Math.round(drone!.heading!)}°` : '—'}</dd>
        <dt>{t('drone.speed')}</dt>
        <dd>{online ? `${drone!.speedMs.toFixed(1)} m/s` : '—'}</dd>
        <dt>{t('drone.crab')}</dt>
        <dd>{online ? `${Math.round(drone!.crabDeg)}°` : '—'}</dd>
        <dt>{t('drone.battery')}</dt>
        <dd>{battery}</dd>
        <dt>{t('drone.position')}</dt>
        <dd>
          {(online || lost) && drone?.position ? `${drone.position.lat.toFixed(5)}, ${drone.position.lng.toFixed(5)}` : '—'}
        </dd>
      </dl>
      {(online || lost) && (
        <section className="drone-tasks" aria-label={t('drone.tasks')}>
          <h4>{t('drone.tasks')}</h4>
          {lost ? (
            drone!.tasks.length > 0 && (
              <>
                <p className="muted">{t('drone.tasksUnfinished')}</p>
                <ol>
                  {drone!.tasks.map((point, index) => (
                    <li key={`${index}-${point.lat}-${point.lng}`}>{`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</li>
                  ))}
                </ol>
              </>
            )
          ) : drone!.tasks.length === 0 ? (
            <p className="muted">{t('drone.tasksEmpty')}</p>
          ) : (
            <>
              <ol>
                {drone!.tasks.map((point, index) => (
                  <li key={`${index}-${point.lat}-${point.lng}`}>
                    <span>{`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</span>
                    <button
                      type="button"
                      aria-label={t('drone.taskRemove', { n: index + 1 })}
                      title={t('drone.taskRemove', { n: index + 1 })}
                      onClick={() => removeDroneTask(droneId, index)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => clearDroneTasks(droneId)}>
                {t('drone.tasksClear')}
              </button>
            </>
          )}
        </section>
      )}
    </Accordion>
  );
}
