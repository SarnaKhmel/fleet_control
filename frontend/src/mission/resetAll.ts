import { MISSION_DEFAULT_AREA_KM } from '../../../shared/protocol';
import { sendClientMessage } from './missionSocket';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';

/**
 * Clears everything the operator built: a running mission (on the server too), drone selection, start
 * and control points, the route, the modes and the zone. Map view and settings are kept.
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
    picking: false,
    moveMode: false,
    routeMode: false,
    routePoints: [],
    drawing: false,
    drawAnchor: null,
    drawCursor: null,
    zoneChosen: false,
    phase: 'idle',
    drones: {},
    error: null,
  });
}
