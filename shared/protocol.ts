import type { ReconCell, ReconGrid } from './mission/recon.js';
import type { HitOutcome, MissionUnit } from './mission/units.js';
import { isMissionOdds, type MissionOdds } from './mission/odds.js';
import { isComposition, type Composition } from './mission/composition.js';

// WebSocket protocol shared by the simulator (backend) and the dashboard (frontend).
// Server is the source of truth; the client sends intents only. Every incoming message is
// validated with the guards below before it is used.

/** Drones in a mission: the operator picks how many, from 1 to MAX_DRONES. */
export const DEFAULT_DRONE_COUNT = 3;
export const MAX_DRONES = 20;

/** Id of the drone at `index` (0-based) in a mission: drone-1, drone-2, … */
export function droneIdOf(index: number): string {
  return `drone-${index + 1}`;
}

/** Callsign of the drone at `index` (0-based): BA-01 … BA-20. */
export function callsignOf(index: number): string {
  return `BA-${String(index + 1).padStart(2, '0')}`;
}

export function isDroneCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_DRONES;
}
export const MISSION_DEFAULT_AREA_KM = 50;
export const MISSION_MAX_AREA_KM = 500;
export const CLUSTER_MAX_RADIUS_M = 5000;
/** Ground altitude above sea level, meters, used where the terrain is not known (no elevation tile). */
export const GROUND_AMSL_M = 150;

/** Height a drone holds above the ground under it, meters: the default and the range the operator can set. */
export const DEFAULT_ALTITUDE_AGL_M = 60;
export const MIN_ALTITUDE_AGL_M = 20;
export const MAX_ALTITUDE_AGL_M = 500;
/** Cruise speed over the ground, m/s: the default and the range the operator can set. */
export const DEFAULT_CRUISE_SPEED_MS = 10;
export const MIN_CRUISE_SPEED_MS = 3;
export const MAX_CRUISE_SPEED_MS = 30;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mission zone: a rectangle in meters around a center (default 50 × 50 km). */
export interface MissionArea {
  center: LatLng;
  widthKm: number;
  heightKm: number;
}

/** Where the drones start: all from one point, clustered around a point, or each from its own. */
export type StartLayout =
  | { kind: 'single'; point: LatLng }
  | { kind: 'cluster'; center: LatLng; radiusM: number }
  | { kind: 'separate'; points: LatLng[] };

export type DroneStatus = 'offline' | 'booting' | 'connecting' | 'idle' | 'moving' | 'engaging' | 'returning' | 'lost_link';

/**
 * State of an online drone, set by the server:
 * - `idle`: hovering in the air with nothing to do; `moving`: flying its tasks or a course;
 * - `landing`: coming down where it is; `landed`: on the ground, drawing power only for its link;
 * - `lost_link`: its battery ran out on the ground: intact, but silent;
 * - `destroyed`: its battery ran out in the air and it fell.
 * The last two are final: such a drone keeps its spot, path and tasks on the map and takes no commands.
 */
export type FlightStatus = 'idle' | 'moving' | 'engaging' | 'landing' | 'landed' | 'lost_link' | 'destroyed';

/**
 * How a drone engages an enemy unit: `strike` flies at it until the drone hits it (a kamikaze, destroyed in
 * the hit); `pursuit` keeps 200–400 m from it: behind it while it moves, circling it while it stands.
 */
export type EngageMode = 'strike' | 'pursuit';

/** Id of an enemy unit: enemy-1, enemy-2, … */
export function isEnemyId(value: unknown): value is string {
  return typeof value === 'string' && /^enemy-\d{1,4}$/.test(value);
}

/** Why a drone went down for good: its battery ran out, it flew into a building, or it was shot down by infantry. */
export type DownCause = 'battery' | 'collision' | 'shot_down';

/** A building ahead of a drone that it will hit at its present height. */
export interface CollisionWarning {
  kind: 'building';
  /** Where on its path the drone would hit the building. */
  point: LatLng;
  /** Distance along the path to that point, meters. */
  distanceM: number;
  /** Real (wall-clock) seconds until it gets there at its present speed. */
  etaS: number;
  /** Height of the building above the ground, meters. */
  heightM: number;
}

/** True for an online drone that still takes commands (everything but lost link and destroyed). */
export function takesCommands(status: string | null | undefined): boolean {
  return status === 'idle' || status === 'moving' || status === 'engaging' || status === 'landing' || status === 'landed';
}

/** True for an online drone that is off the ground. */
export function isAirborne(status: string | null | undefined): boolean {
  return status === 'idle' || status === 'moving' || status === 'engaging' || status === 'landing';
}

/** Full telemetry snapshot (tasks/tech.md section 3). Units are in field names. */
export interface DroneTelemetry {
  meta: { timestamp: string; drone_id: string; callsign: string };
  connection: { signal_strength_pct: number; uplink_loss_pct: number; downlink_latency_ms: number; satellites_visible: number; link_type: string };
  flight_status: { armed: boolean; flight_mode: string; landed_state: string; mission_phase: string };
  position_and_kinematics: {
    gps: { latitude: number; longitude: number; altitude_amsl_m: number };
    relative_altitude_m: number;
    ground_speed_ms: number;
    airspeed_ms: number;
    vertical_speed_ms: number;
    heading_deg: number;
  };
  attitude: { pitch_deg: number; roll_deg: number; yaw_deg: number };
  power_system: { battery_remaining_pct: number; voltage_v: number; current_a: number; estimated_flight_time_left_sec: number; battery_temp_c: number };
  health: { cpu_temp_c: number; esc_temp_c: number; imu_ok: boolean; gps_ok: boolean; motors_ok: boolean };
  navigation: { gps_fix_type: 'NONE' | '2D' | '3D' | 'RTK'; current_waypoint_index: number; distance_to_wp_m: number; home_distance_m: number };
  sensors: { targets_in_view: string[]; last_detection: { targetId: string; ts: number } | null };
  environment: { wind_speed_ms: number; wind_dir_deg: number };
  payload: { gimbal: { pitch_deg: number; yaw_deg: number }; camera: { recording: boolean; zoom_factor: number; stream_url: string | null } };
}

// ---- Client → server ----

export type ClientMessage =
  /** `odds`: the odds of this mission (strikes, shoot-downs, placement); the defaults when left out. */
  | { type: 'mission_start'; area: MissionArea; layout: StartLayout; droneCount: number; odds?: MissionOdds; composition?: Composition }
  | { type: 'mission_reset' }
  /** Without `append` the target replaces the drones' tasks; with it, the target goes to the end of them. */
  | { type: 'move'; droneIds: string[]; target: LatLng; append?: boolean }
  /** Drops all tasks: the drones hover where they are. */
  | { type: 'hold'; droneIds: string[] }
  /** Lands the drones where they are; their tasks are dropped. A later move takes them up again. */
  | { type: 'land'; droneIds: string[] }
  /** Sets the height above the ground and/or the cruise speed of the drones (at least one of the two). */
  | { type: 'set_flight'; droneIds: string[]; altitudeAglM?: number; cruiseSpeedMs?: number }
  /** Sends a drone at an enemy unit (enemy-N). Refused unless the unit is known; pursuit also needs it within camera range. */
  | { type: 'engage'; droneId: string; targetId: string; mode: EngageMode }
  /** Drops one task (0 = the current one) from a drone's list. */
  | { type: 'remove_task'; droneId: string; index: number }
  /** Moves one task of a drone's list to another point. */
  | { type: 'update_task'; droneId: string; index: number; point: LatLng }
  | { type: 'heading'; droneIds: string[]; headingDeg: number }
  | { type: 'wind'; speedMs: number; fromDeg: number }
  | { type: 'route'; droneId: string; points: LatLng[] };

// ---- Server → client ----

export type MissionErrorReason = 'outside_area' | 'already_running' | 'bad_placement';

/** One drone as seen by a client that connects in the middle of a mission. */
export interface SnapshotDrone {
  droneId: string;
  callsign: string;
  status: 'booting' | 'connecting' | FlightStatus;
  /** Why it went down, for lost_link and destroyed. */
  cause?: DownCause;
  /** A building ahead that it will hit, if any. */
  warning?: CollisionWarning | null;
  progress: number;
  position: LatLng | null;
  heading: number | null;
  altitudeM: number | null;
  /** Ground elevation under the drone (AMSL); null until online. */
  groundM: number | null;
  speedMs: number;
  batteryPct: number;
  crabDeg: number;
  altitudeAglM: number;
  cruiseSpeedMs: number;
  /** Path flown for the current task list: where the drone set off, then each point it reached or turned at. */
  trail: LatLng[];
  /** Points the drone still has to fly to, the current one first. */
  tasks: LatLng[];
}

export type ServerMessage =
  /** `droneCount` is the size of the running mission's fleet (0 when none runs); `drones` lists those started so far. */
  /** `units`: the enemy and allied units known so far. */
  | { type: 'mission_snapshot'; running: boolean; droneCount: number; drones: SnapshotDrone[]; recon?: { grid: ReconGrid; cells: ReconCell[] }; units?: MissionUnit[] }
  /**
   * Units newly known or changed (an enemy found, or one in sight that moved): each replaces the one with its id.
   * An enemy out of sight is not sent: the dashboard keeps it where it was last seen.
   */
  | { type: 'units'; units: MissionUnit[] }
  /** Ground the cameras saw for the first time in the last tick, as cells of the grid (only the new ones). */
  | { type: 'recon_cells'; grid: ReconGrid; cells: ReconCell[] }
  | { type: 'drone_boot'; droneId: string; status: 'booting' | 'connecting'; progress: number }
  | { type: 'drone_online'; telemetry: DroneTelemetry }
  /** `groundM`: ground elevation under the drone (AMSL), so its height above the ground is altitudeM - groundM. */
  | { type: 'position'; droneId: string; position: LatLng; heading: number; speedMs: number; altitudeM: number; groundM: number; batteryPct: number; crabDeg: number; }
  /** A drone's task list and flown path. Sent only when they change; positions do not carry them. */
  | { type: 'drone_tasks'; droneId: string; trail: LatLng[]; tasks: LatLng[] }
  /** The height above ground and cruise speed the drone keeps. Sent when it comes online and on a change. */
  | { type: 'drone_settings'; droneId: string; altitudeAglM: number; cruiseSpeedMs: number }
  /** An online drone's state changed (see FlightStatus). Sent only on a change; `cause` says why it went down. */
  | { type: 'drone_status'; droneId: string; status: FlightStatus; cause?: DownCause }
  /**
   * A building ahead on the drone's path at or above its height: sent every tick while it lasts, then
   * once with `warning: null` when the path is clear again.
   */
  | { type: 'drone_warning'; droneId: string; warning: CollisionWarning | null }
  /** The result of a drone's strike on a unit: destroyed units leave the map, damaged ones stay marked. */
  | { type: 'unit_hit'; unitId: string; droneId: string; outcome: HitOutcome }
  | { type: 'mission_error'; reason: MissionErrorReason }
  | { type: 'mission_reset' };

// ---- Guards (trust boundary) ----

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Partial<LatLng>;
  return isFiniteNumber(lat) && isFiniteNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function isMissionArea(value: unknown): value is MissionArea {
  if (typeof value !== 'object' || value === null) return false;
  const { center, widthKm, heightKm } = value as Partial<MissionArea>;
  const sizeOk = (n: unknown): n is number => isFiniteNumber(n) && n > 0 && n <= MISSION_MAX_AREA_KM;
  return isLatLng(center) && sizeOk(widthKm) && sizeOk(heightKm);
}

export function isStartLayout(value: unknown): value is StartLayout {
  if (typeof value !== 'object' || value === null) return false;
  const layout = value as Record<string, unknown>;
  switch (layout.kind) {
    case 'single':
      return isLatLng(layout.point);
    case 'cluster':
      return isLatLng(layout.center) && isFiniteNumber(layout.radiusM) && layout.radiusM > 0 && layout.radiusM <= CLUSTER_MAX_RADIUS_M;
    case 'separate':
      // One point per drone; parseClientMessage checks the count against droneCount.
      return Array.isArray(layout.points) && layout.points.length >= 1 && layout.points.length <= MAX_DRONES && layout.points.every(isLatLng);
    default:
      return false;
  }
}

/** Returns the parsed client message, or null for anything malformed or unknown. */
/** Longest task list a drone keeps (a route has at most this many control points). */
export const MAX_TASKS = 500;

/** Control points for one drone's route: 1 to MAX_TASKS valid coordinates. */
export function isLatLngList(value: unknown): value is LatLng[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_TASKS && value.every(isLatLng);
}

export function isDroneId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

export function isDroneIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_DRONES && value.every(isDroneId);
}

/** Position in a drone's task list: a whole number below MAX_TASKS. */
export function isTaskIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_TASKS;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Record<string, unknown>;
  if (message.type === 'mission_reset') return { type: 'mission_reset' };
  if (message.type === 'mission_start' && isMissionArea(message.area) && isStartLayout(message.layout) && isDroneCount(message.droneCount)) {
    // A layout with a point per drone must have exactly one point for each.
    if (message.layout.kind === 'separate' && message.layout.points.length !== message.droneCount) return null;
    if (message.odds !== undefined && !isMissionOdds(message.odds)) return null;
    if (message.composition !== undefined && !isComposition(message.composition)) return null;
    return {
      type: 'mission_start',
      area: message.area,
      layout: message.layout,
      droneCount: message.droneCount,
      ...(message.odds !== undefined ? { odds: message.odds as MissionOdds } : {}),
      ...(message.composition !== undefined ? { composition: message.composition as Composition } : {}),
    };
  }
  if (message.type === 'move' && isDroneIds(message.droneIds) && isLatLng(message.target) && (message.append === undefined || typeof message.append === 'boolean')) {
    return message.append ? { type: 'move', droneIds: message.droneIds, target: message.target, append: true } : { type: 'move', droneIds: message.droneIds, target: message.target };
  }
  if (message.type === 'engage' && isDroneId(message.droneId) && isEnemyId(message.targetId) && (message.mode === 'strike' || message.mode === 'pursuit')) {
    return { type: 'engage', droneId: message.droneId, targetId: message.targetId, mode: message.mode };
  }
  if (message.type === 'hold' && isDroneIds(message.droneIds)) {
    return { type: 'hold', droneIds: message.droneIds };
  }
  if (message.type === 'land' && isDroneIds(message.droneIds)) {
    return { type: 'land', droneIds: message.droneIds };
  }
  if (message.type === 'set_flight' && isDroneIds(message.droneIds)) {
    const inRange = (v: unknown, min: number, max: number) => v === undefined || (isFiniteNumber(v) && v >= min && v <= max);
    const { altitudeAglM, cruiseSpeedMs } = message;
    if (altitudeAglM === undefined && cruiseSpeedMs === undefined) return null;
    if (!inRange(altitudeAglM, MIN_ALTITUDE_AGL_M, MAX_ALTITUDE_AGL_M) || !inRange(cruiseSpeedMs, MIN_CRUISE_SPEED_MS, MAX_CRUISE_SPEED_MS)) return null;
    return {
      type: 'set_flight',
      droneIds: message.droneIds,
      ...(altitudeAglM !== undefined ? { altitudeAglM: altitudeAglM as number } : {}),
      ...(cruiseSpeedMs !== undefined ? { cruiseSpeedMs: cruiseSpeedMs as number } : {}),
    };
  }
  if (message.type === 'remove_task' && isDroneId(message.droneId) && isTaskIndex(message.index)) {
    return { type: 'remove_task', droneId: message.droneId, index: message.index };
  }
  if (message.type === 'update_task' && isDroneId(message.droneId) && isTaskIndex(message.index) && isLatLng(message.point)) {
    return { type: 'update_task', droneId: message.droneId, index: message.index, point: message.point };
  }
  if (message.type === 'route' && typeof message.droneId === 'string' && message.droneId.length > 0 && isLatLngList(message.points)) {
    return { type: 'route', droneId: message.droneId, points: message.points };
  }
  if (message.type === 'wind' && isFiniteNumber(message.speedMs) && message.speedMs >= 0 && message.speedMs <= 60 && isFiniteNumber(message.fromDeg) && message.fromDeg >= 0 && message.fromDeg < 360) {
    return { type: 'wind', speedMs: message.speedMs, fromDeg: message.fromDeg };
  }
  if (message.type === 'heading' && isDroneIds(message.droneIds) && isFiniteNumber(message.headingDeg) && message.headingDeg >= 0 && message.headingDeg < 360) {
    return { type: 'heading', droneIds: message.droneIds, headingDeg: message.headingDeg };
  }
  return null;
}
