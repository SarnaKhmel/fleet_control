import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  MAX_ALTITUDE_AGL_M,
  MAX_CRUISE_SPEED_MS,
  MIN_ALTITUDE_AGL_M,
  MIN_CRUISE_SPEED_MS,
} from '../../../shared/protocol';
import { useMissionStore } from '../mission/missionStore';
import { commandableSelected, setSelectedFlight } from '../mission/missionSocket';
import { useSelectionStore } from '../mission/selection';

/**
 * Height above the ground and cruise speed for the selected drones, one or a group. The fields start
 * from the first selected drone's settings; Apply sends both to every selected drone that takes commands.
 * It subscribes to those settings only, so position updates do not re-render it.
 */
export function FlightSettings() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const { count, altitudeAglM, cruiseSpeedMs } = useMissionStore(
    useShallow((s) => {
      const ids = commandableSelected(s.drones, selectedIds);
      const first = ids.length > 0 ? s.drones[ids[0]] : undefined;
      return { count: ids.length, altitudeAglM: first?.altitudeAglM, cruiseSpeedMs: first?.cruiseSpeedMs };
    }),
  );
  if (count === 0 || altitudeAglM === undefined || cruiseSpeedMs === undefined) return null;
  // A new selection or new settings from the server start the form over.
  return <FlightSettingsForm key={`${selectedIds.join()}|${altitudeAglM}|${cruiseSpeedMs}`} count={count} altitudeAglM={altitudeAglM} cruiseSpeedMs={cruiseSpeedMs} />;
}

function FlightSettingsForm({ count, altitudeAglM, cruiseSpeedMs }: { count: number; altitudeAglM: number; cruiseSpeedMs: number }) {
  const { t } = useTranslation();
  const [altitude, setAltitude] = useState(String(altitudeAglM));
  const [speed, setSpeed] = useState(String(cruiseSpeedMs));
  const altitudeValue = Number(altitude);
  const speedValue = Number(speed);
  const valid =
    altitude !== '' && speed !== '' &&
    altitudeValue >= MIN_ALTITUDE_AGL_M && altitudeValue <= MAX_ALTITUDE_AGL_M &&
    speedValue >= MIN_CRUISE_SPEED_MS && speedValue <= MAX_CRUISE_SPEED_MS;

  return (
    <form
      className="flight-settings"
      aria-label={t('drone.flight')}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) setSelectedFlight({ altitudeAglM: altitudeValue, cruiseSpeedMs: speedValue });
      }}
    >
      <label>
        {t('drone.flightAltitude')}
        <input type="number" min={MIN_ALTITUDE_AGL_M} max={MAX_ALTITUDE_AGL_M} step={10} value={altitude} onChange={(e) => setAltitude(e.target.value)} />
      </label>
      <label>
        {t('drone.flightSpeed')}
        <input type="number" min={MIN_CRUISE_SPEED_MS} max={MAX_CRUISE_SPEED_MS} step={1} value={speed} onChange={(e) => setSpeed(e.target.value)} />
      </label>
      <button type="submit" disabled={!valid}>
        {t('drone.flightApply', { count })}
      </button>
    </form>
  );
}
