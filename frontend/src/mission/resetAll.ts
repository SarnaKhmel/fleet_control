import { DEFAULT_DRONE_COUNT, MISSION_DEFAULT_AREA_KM } from '../../../shared/protocol';
import { DEFAULT_ODDS } from '../../../shared/mission/odds';
import { DEFAULT_ENEMY_COUNTS } from '../../../shared/mission/composition';
import { sendClientMessage } from './missionSocket';
import { defaultAllyCounts, useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';

/**
 * Clears everything the operator built: a running mission (on the server too), drone selection, start
 * points, the modes and the zone. Map view and settings are kept.
 */
export function resetEverything(): void {
  if (useMissionStore.getState().phase === 'running') sendClientMessage({ type: 'mission_reset' });
  useSelectionStore.getState().clear();
  useMissionStore.setState({
    center: null,
    widthKm: MISSION_DEFAULT_AREA_KM,
    heightKm: MISSION_DEFAULT_AREA_KM,
    layoutKind: 'single',
    points: [],
    clusterRadiusM: 500,
    droneCount: DEFAULT_DRONE_COUNT,
    picking: false,
    placing: null,
    odds: DEFAULT_ODDS,
    enemyCounts: { ...DEFAULT_ENEMY_COUNTS },
    allyCounts: defaultAllyCounts(),
    placed: [],
    clock: { startedAt: null, simulatedS: 0, speed: 1, paused: false },
    drawing: false,
    drawAnchor: null,
    drawCursor: null,
    zoneChosen: false,
    phase: 'idle',
    drones: {},
    error: null,
  });
}
