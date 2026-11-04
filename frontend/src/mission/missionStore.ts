import { create } from 'zustand';
import {
  DEFAULT_DRONE_COUNT,
  MAX_DRONES,
  isLatLng,
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
  /** `lost_link`: the battery ran out; the drone lies at `position` and keeps its path and tasks for the map. */
  status: 'booting' | 'connecting' | 'idle' | 'lost_link';
  progress: number;
  /** Known once the drone is online; null while it is still booting. */
  position: LatLng | null;
  /** Altitude above sea level, meters; null until online. */
  altitudeM: number | null;
  speedMs: number;
  batteryPct: number;
  /** Crab angle: how far the nose is turned into the wind, degrees (negative = left). */
  crabDeg: number;
  heading: number | null;
  /** Path flown for the current task list: where the drone set off, then each point it reached or turned at. */
  trail: LatLng[];
  /** Points the server is flying the drone through, the current one first. */
  tasks: LatLng[];
}

export interface MissionState {
  /** Drones in the mission (1 to MAX_DRONES): set before the start, then the running mission's count. */
  droneCount: number;
  center: LatLng | null;
  widthKm: number;
  heightKm: number;
  layoutKind: LayoutKind;
  points: LatLng[];
  clusterRadiusM: number;
  picking: boolean;
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
  /** Rounds and clamps to 1…MAX_DRONES; extra start points of a separate layout are dropped. */
  setDroneCount: (count: number) => void;
  setPicking: (picking: boolean) => void;
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

/**
 * A list of points from the server, or an empty list if it is missing or malformed (for example from a
 * server of an older build), so the map and panels can always read it.
 */
function pointList(value: unknown): LatLng[] {
  return Array.isArray(value) && value.every(isLatLng) ? value : [];
}

/** Zone center: the chosen center, else the selected location, else the default city. */
export function effectiveCenter(state: Pick<MissionState, 'center'>): LatLng {
  return state.center ?? useLocationStore.getState().selected ?? DEFAULT_CENTER;
}

/** Layout built from the picked points, or null when the picks are not complete. */
export function layoutFrom(state: Pick<MissionState, 'layoutKind' | 'points' | 'clusterRadiusM' | 'droneCount'>): StartLayout | null {
  const { layoutKind, points, clusterRadiusM, droneCount } = state;
  if (layoutKind === 'single' && points.length === 1) return { kind: 'single', point: points[0] };
  if (layoutKind === 'cluster' && points.length === 1) return { kind: 'cluster', center: points[0], radiusM: clusterRadiusM };
  if (layoutKind === 'separate' && points.length === droneCount) return { kind: 'separate', points };
  return null;
}

/** Reason the mission cannot start yet, or null when it can. */
export function startProblem(
  state: Pick<MissionState, 'center' | 'widthKm' | 'heightKm' | 'layoutKind' | 'points' | 'clusterRadiusM' | 'droneCount'>,
): 'incomplete' | 'outside' | null {
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
  droneCount: DEFAULT_DRONE_COUNT,
  picking: false,
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
  setDroneCount: (count) => {
    if (locked(get) || !Number.isFinite(count)) return;
    const droneCount = Math.min(MAX_DRONES, Math.max(1, Math.round(count)));
    const { layoutKind, points } = get();
    set({ droneCount, points: layoutKind === 'separate' ? points.slice(0, droneCount) : points });
  },
  setPicking: (picking) => (locked(get) && picking ? undefined : set({ picking })),
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
    const max = layoutKind === 'separate' ? get().droneCount : 1;
    // Keep the newest picks: a click past the limit replaces the oldest pick.
    set({ points: [...points, point].slice(-max) });
  },
  clearPoints: () => (locked(get) ? undefined : set({ points: [] })),
  // Setup modes end with the start: their buttons lock, and a left-on mode would swallow every map click.
  markStarting: () => set({ phase: 'running', drones: {}, error: null, picking: false, drawing: false, drawAnchor: null, drawCursor: null }),
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
              altitudeM: null,
              speedMs: 0,
              batteryPct: 100,
              crabDeg: 0,
              trail: [],
              tasks: [],
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
              altitudeM: message.telemetry.position_and_kinematics.gps.altitude_amsl_m,
              speedMs: 0,
              batteryPct: message.telemetry.power_system.battery_remaining_pct,
              crabDeg: 0,
              trail: [],
              tasks: [],
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
            [message.droneId]: {
              ...drone,
              position: message.position,
              heading: message.heading,
              altitudeM: message.altitudeM,
              speedMs: message.speedMs,
              batteryPct: message.batteryPct,
              crabDeg: message.crabDeg,
            },
          },
        });
        return;
      }
      case 'drone_tasks': {
        const drone = get().drones[message.droneId];
        if (!drone) return;
        set({
          drones: {
            ...get().drones,
            [message.droneId]: { ...drone, trail: pointList(message.trail), tasks: pointList(message.tasks) },
          },
        });
        return;
      }
      case 'drone_lost': {
        const drone = get().drones[message.droneId];
        if (!drone) return;
        set({ drones: { ...get().drones, [message.droneId]: { ...drone, status: 'lost_link', speedMs: 0 } } });
        return;
      }
      case 'mission_snapshot': {
        const drones: Record<string, DroneView> = {};
        for (const d of message.drones) {
          drones[d.droneId] = {
            callsign: d.callsign,
            status: d.status,
            progress: d.progress,
            position: d.position,
            heading: d.heading,
            altitudeM: d.altitudeM,
            speedMs: d.speedMs,
            batteryPct: d.batteryPct,
            crabDeg: d.crabDeg,
            trail: pointList(d.trail),
            tasks: pointList(d.tasks),
          };
        }
        // A running mission's fleet size is the server's; when none runs, keep the operator's choice.
        set({ phase: message.running ? 'running' : 'idle', drones, error: null, ...(message.running ? { droneCount: message.droneCount } : {}) });
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
