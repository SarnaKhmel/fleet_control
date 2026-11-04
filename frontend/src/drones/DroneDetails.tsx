import { useTranslation } from 'react-i18next';
import { GROUND_AMSL_M } from '../../../shared/protocol';
import { Accordion } from '../sidebar/Accordion';
import type { DroneView } from '../mission/missionStore';

interface DroneDetailsProps {
  droneId: string;
  drone: DroneView | undefined;
  defaultOpen: boolean;
}

/** One drone as a collapsible section: summary in the header, telemetry inside. */
export function DroneDetails({ droneId, drone, defaultOpen }: DroneDetailsProps) {
  const { t } = useTranslation();
  const callsign = drone?.callsign ?? droneId;
  const online = drone?.status === 'idle' && drone.altitudeM !== null;
  const altitude = online ? `${Math.round(drone!.altitudeM! - GROUND_AMSL_M)} m` : '—';
  const battery = drone ? `${Math.round(drone.batteryPct)}%` : '—';
  const status = drone?.status ? t(`mission.status.${drone.status}`) : t('mission.status.offline');

  return (
    <Accordion title={callsign} summary={`${altitude} · ${battery}`} defaultOpen={defaultOpen}>
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
          {online && drone?.position ? `${drone.position.lat.toFixed(5)}, ${drone.position.lng.toFixed(5)}` : '—'}
        </dd>
      </dl>
    </Accordion>
  );
}
