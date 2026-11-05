import { useTranslation } from 'react-i18next';
import { SIM_SPEEDS } from '../../../shared/mission/clock';
import { useMissionStore } from './missionStore';
import { setMissionClock } from './missionSocket';
import { formatDuration, formatStart } from './clockFormat';

/**
 * The mission clock: when the mission started, the simulated time since, the speed (×1 to ×10) and the pause.
 * The speed and the pause take effect at once on the server; they apply to a running mission.
 */
export function MissionClock() {
  const { t } = useTranslation();
  const clock = useMissionStore((s) => s.clock);
  const running = clock.startedAt !== null;

  return (
    <section className="mission-clock" aria-label={t('mission.clock.title')}>
      <h4>{t('mission.clock.title')}</h4>
      <p className="muted">{running ? t('mission.clock.started', { time: formatStart(clock.startedAt!) }) : t('mission.clock.notStarted')}</p>
      <p>{t('mission.clock.elapsed', { time: formatDuration(clock.simulatedS) })}</p>
      <div role="group" aria-label={t('mission.clock.speed')} className="mission-clock-speeds">
        {SIM_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            disabled={!running}
            aria-pressed={!clock.paused && clock.speed === speed}
            onClick={() => setMissionClock({ speed, paused: false })}
          >
            {`×${speed}`}
          </button>
        ))}
        <button type="button" disabled={!running} aria-pressed={clock.paused} onClick={() => setMissionClock({ paused: !clock.paused })}>
          {clock.paused ? t('mission.clock.resume') : t('mission.clock.pause')}
        </button>
      </div>
    </section>
  );
}
