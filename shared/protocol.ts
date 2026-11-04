// WebSocket protocol shared by the simulator (backend) and the dashboard (frontend).
// Server is the source of truth; the client sends intents only. Every incoming message is
// validated with the guards below before it is used.

export const DRONE_COUNT = 3;
export const MISSION_DEFAULT_AREA_KM = 200;
export const MISSION_MAX_AREA_KM = 500;
export const CLUSTER_MAX_RADIUS_M = 5000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mission zone: a rectangle in meters around a center (default 200 × 200 km). */
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
  | { type: 'mission_start'; area: MissionArea; layout: StartLayout }
  | { type: 'mission_reset' }
  | { type: 'move'; droneIds: string[]; target: LatLng };

// ---- Server → client ----

export type MissionErrorReason = 'outside_area' | 'already_running';

export type ServerMessage =
  | { type: 'drone_boot'; droneId: string; status: 'booting' | 'connecting'; progress: number }
  | { type: 'drone_online'; telemetry: DroneTelemetry }
  | { type: 'position'; droneId: string; position: LatLng; heading: number; speedMs: number }
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
      return Array.isArray(layout.points) && layout.points.length === DRONE_COUNT && layout.points.every(isLatLng);
    default:
      return false;
  }
}

/** Returns the parsed client message, or null for anything malformed or unknown. */
export function isDroneIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= DRONE_COUNT && value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64);
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Record<string, unknown>;
  if (message.type === 'mission_reset') return { type: 'mission_reset' };
  if (message.type === 'mission_start' && isMissionArea(message.area) && isStartLayout(message.layout)) {
    return { type: 'mission_start', area: message.area, layout: message.layout };
  }
  if (message.type === 'move' && isDroneIds(message.droneIds) && isLatLng(message.target)) {
    return { type: 'move', droneIds: message.droneIds, target: message.target };
  }
  return null;
}
