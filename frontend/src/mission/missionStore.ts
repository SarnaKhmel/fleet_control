import { create } from 'zustand';
import {
  DRONE_COUNT,
  MISSION_DEFAULT_AREA_KM,
  MISSION_MAX_AREA_KM,
  type LatLng,
  type MissionErrorReason,
  type ServerMessage,
  type StartLayout,
} from '../../../shared/protocol';
import { areaFromCorners, areaRing, isInsideArea } from '../../../shared/mission/area';
import { DEFAULT_CENTER } from '../map/mapStyles';
import { useLocationStore } from '../location/locationStore';

export type LayoutKind = 'single' | 'cluster' | 'separate';
export type MissionPhase = 'idle' | 'running';

export interface DroneView {
  callsign: string;
  status: 'booting' | 'connecting' | 'idle';
  progress: number;
  /** Known once the drone is online; null while it is still booting. */
  position: LatLng | null;
  heading: number | null;
}

export interface MissionState {
  center: LatLng | null;
  widthKm: number;
  heightKm: number;
  layoutKind: LayoutKind;
  points: LatLng[];
  clusterRadiusM: number;
  picking: boolean;
  /** Move mode: the next map click sends the online drones to that point. */
  moveMode: boolean;
  /** Drawing the zone: two clicks give opposite corners. */
  drawing: boolean;
  drawAnchor: LatLng | null;
  drawCursor: LatLng | null;
  /** The operator has chosen the zone (drawn it or set its size or center). The default is not a choice. */
  zoneChosen: boolean;
  /** Whether the zone is at least partly on screen (set by the map). */
  zoneVisible: boolean;
  phase: MissionPhase;
  drones: Record<string, DroneView>;
  error: MissionErrorReason | null;
  setCenter: (center: LatLng | null) => void;
  setSize: (widthKm: number, heightKm: number) => void;
  setLayoutKind: (kind: LayoutKind) => void;
  setClusterRadius: (meters: number) => void;
  setPicking: (picking: boolean) => void;
  setMoveMode: (on: boolean) => void;
  setDrawing: (drawing: boolean) => void;
  /** Map click while drawing: the first click sets a corner, the second closes the zone. */
  drawClick: (point: LatLng) => void;
  setDrawCursor: (point: LatLng | null) => void;
  setZoneVisible: (visible: boolean) => void;
  addPoint: (point: LatLng) => void;
  clearPoints: () => void;
  apply: (message: ServerMessage) => void;
  markStarting: () => void;
}

/** Zone center: the chosen center, else the selected location, else the default city. */
export function effectiveCenter(state: Pick<MissionState, 'center'>): LatLng {
  return state.center ?? useLocationStore.getState().selected ?? DEFAULT_CENTER;
}

/** Layout built from the picked points, or null when the picks are not complete. */
export function layoutFrom(state: Pick<MissionState, 'layoutKind' | 'points' | 'clusterRadiusM'>): StartLayout | null {
  const { layoutKind, points, clusterRadiusM } = state;
  if (layoutKind === 'single' && points.length === 1) return { kind: 'single', point: points[0] };
  if (layoutKind === 'cluster' && points.length === 1) return { kind: 'cluster', center: points[0], radiusM: clusterRadiusM };
  if (layoutKind === 'separate' && points.length === DRONE_COUNT) return { kind: 'separate', points };
  return null;
}

/** Reason the mission cannot start yet, or null when it can. */
export function startProblem(state: MissionState): 'incomplete' | 'outside' | null {
  const layout = layoutFrom(state);
  if (!layout) return 'incomplete';
  const area = { center: effectiveCenter(state), widthKm: state.widthKm, heightKm: state.heightKm };
  const starts = layout.kind === 'separate' ? layout.points : state.points;
  return starts.every((p) => isInsideArea(p, area)) ? null : 'outside';
}

// Once a mission runs, its zone, layout and start points are fixed; only move and reset remain.
const locked = (get: () => MissionState) => get().phase === 'running';

export const useMissionStore = create<MissionState>()((set, get) => ({
  center: null,
  widthKm: MISSION_DEFAULT_AREA_KM,
  heightKm: MISSION_DEFAULT_AREA_KM,
  layoutKind: 'single',
  points: [],
  clusterRadiusM: 500,
  picking: false,
  moveMode: false,
  drawing: false,
  drawAnchor: null,
  drawCursor: null,
  zoneChosen: false,
  zoneVisible: true,
  phase: 'idle',
  drones: {},
  error: null,
  setCenter: (center) => (locked(get) ? undefined : set({ center, zoneChosen: true })),
  setSize: (widthKm, heightKm) => (locked(get) ? undefined : set({ widthKm, heightKm, zoneChosen: true })),
  setLayoutKind: (layoutKind) => (locked(get) ? undefined : set({ layoutKind, points: [] })),
  setClusterRadius: (clusterRadiusM) => (locked(get) ? undefined : set({ clusterRadiusM })),
  setPicking: (picking) => (locked(get) && picking ? undefined : set({ picking })),
  setMoveMode: (moveMode) => set({ moveMode }),
  setDrawing: (drawing) => (locked(get) && drawing ? undefined : set({ drawing, drawAnchor: null, drawCursor: null })),
  drawClick: (point) => {
    if (locked(get)) return;
    const { drawAnchor } = get();
    if (!drawAnchor) {
      set({ drawAnchor: point, drawCursor: point });
      return;
    }
    const zone = areaFromCorners(drawAnchor, point, MISSION_MAX_AREA_KM);
    set({ ...zone, zoneChosen: true, drawing: false, drawAnchor: null, drawCursor: null });
  },
  setDrawCursor: (drawCursor) => set({ drawCursor }),
  setZoneVisible: (zoneVisible) => set({ zoneVisible }),
  addPoint: (point) => {
    if (locked(get)) return;
    const { layoutKind, points } = get();
    const max = layoutKind === 'separate' ? DRONE_COUNT : 1;
    // Keep the newest picks: a click past the limit replaces the oldest pick.
    set({ points: [...points, point].slice(-max) });
  },
  clearPoints: () => (locked(get) ? undefined : set({ points: [] })),
  markStarting: () => set({ phase: 'running', drones: {}, error: null }),
  apply: (message) => {
    switch (message.type) {
      case 'drone_boot': {
        const prev = get().drones[message.droneId];
        set({
          drones: {
            ...get().drones,
            [message.droneId]: {
              callsign: prev?.callsign ?? message.droneId,
              status: message.status,
              progress: message.progress,
              position: null,
              heading: null,
            },
          },
        });
        return;
      }
      case 'drone_online':
        set({
          drones: {
            ...get().drones,
            [message.telemetry.meta.drone_id]: {
              callsign: message.telemetry.meta.callsign,
              status: 'idle',
              progress: 100,
              position: {
                lat: message.telemetry.position_and_kinematics.gps.latitude,
                lng: message.telemetry.position_and_kinematics.gps.longitude,
              },
              heading: message.telemetry.position_and_kinematics.heading_deg,
            },
          },
        });
        return;
      case 'position': {
        const drone = get().drones[message.droneId];
        if (!drone) return;
        set({
          drones: {
            ...get().drones,
            [message.droneId]: { ...drone, position: message.position, heading: message.heading },
          },
        });
        return;
      }
      case 'mission_error':
        set({ phase: 'idle', error: message.reason });
        return;
      case 'mission_reset':
        set({ phase: 'idle', drones: {}, error: null });
        return;
    }
  },
}));

export function areaRingFor(state: MissionState) {
  return areaRing({ center: effectiveCenter(state), widthKm: state.widthKm, heightKm: state.heightKm });
}
