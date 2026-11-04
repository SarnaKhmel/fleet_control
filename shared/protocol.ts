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
/** Launch site altitude above sea level, meters. Drones take off from here. */
export const GROUND_AMSL_M = 150;

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
  | { type: 'mission_start'; area: MissionArea; layout: StartLayout; droneCount: number }
  | { type: 'mission_reset' }
  /** Without `append` the target replaces the drones' tasks; with it, the target goes to the end of them. */
  | { type: 'move'; droneIds: string[]; target: LatLng; append?: boolean }
  /** Drops all tasks: the drones hover where they are. */
  | { type: 'hold'; droneIds: string[] }
  /** Drops one task (0 = the current one) from a drone's list. */
  | { type: 'remove_task'; droneId: string; index: number }
  /** Moves one task of a drone's list to another point. */
  | { type: 'update_task'; droneId: string; index: number; point: LatLng }
  | { type: 'heading'; droneIds: string[]; headingDeg: number }
  | { type: 'wind'; speedMs: number; fromDeg: number }
  | { type: 'route'; droneId: string; points: LatLng[] };

// ---- Server → client ----

export type MissionErrorReason = 'outside_area' | 'already_running';

/** One drone as seen by a client that connects in the middle of a mission. */
export interface SnapshotDrone {
  droneId: string;
  callsign: string;
  status: 'booting' | 'connecting' | 'idle';
  progress: number;
  position: LatLng | null;
  heading: number | null;
  altitudeM: number | null;
  speedMs: number;
  batteryPct: number;
  crabDeg: number;
  /** Path flown for the current task list: where the drone set off, then each point it reached or turned at. */
  trail: LatLng[];
  /** Points the drone still has to fly to, the current one first. */
  tasks: LatLng[];
}

export type ServerMessage =
  /** `droneCount` is the size of the running mission's fleet (0 when none runs); `drones` lists those started so far. */
  | { type: 'mission_snapshot'; running: boolean; droneCount: number; drones: SnapshotDrone[] }
  | { type: 'drone_boot'; droneId: string; status: 'booting' | 'connecting'; progress: number }
  | { type: 'drone_online'; telemetry: DroneTelemetry }
  | { type: 'position'; droneId: string; position: LatLng; heading: number; speedMs: number; altitudeM: number; batteryPct: number; crabDeg: number; }
  /** A drone's task list and flown path. Sent only when they change; positions do not carry them. */
  | { type: 'drone_tasks'; droneId: string; trail: LatLng[]; tasks: LatLng[] }
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
    return { type: 'mission_start', area: message.area, layout: message.layout, droneCount: message.droneCount };
  }
  if (message.type === 'move' && isDroneIds(message.droneIds) && isLatLng(message.target) && (message.append === undefined || typeof message.append === 'boolean')) {
    return message.append ? { type: 'move', droneIds: message.droneIds, target: message.target, append: true } : { type: 'move', droneIds: message.droneIds, target: message.target };
  }
  if (message.type === 'hold' && isDroneIds(message.droneIds)) {
    return { type: 'hold', droneIds: message.droneIds };
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
