import type { DroneTelemetry } from '../../../shared/protocol.js';
import type { DroneSchedule } from './schedule.js';

// Telemetry for a drone that has just come online. Values not simulated yet use plausible constants.
export function buildTelemetry(entry: DroneSchedule, timestamp: string): DroneTelemetry {
  return {
    meta: { timestamp, drone_id: entry.droneId, callsign: entry.callsign },
    connection: { signal_strength_pct: 95, uplink_loss_pct: 0, downlink_latency_ms: 40, satellites_visible: 12, link_type: 'simulated' },
    flight_status: { armed: true, flight_mode: 'HOLD', landed_state: 'ON_GROUND', mission_phase: 'IDLE' },
    position_and_kinematics: {
      gps: { latitude: entry.start.lat, longitude: entry.start.lng, altitude_amsl_m: 150 },
      relative_altitude_m: 0,
      ground_speed_ms: 0,
      airspeed_ms: 0,
      vertical_speed_ms: 0,
      heading_deg: 0,
    },
    attitude: { pitch_deg: 0, roll_deg: 0, yaw_deg: 0 },
    power_system: { battery_remaining_pct: 100, voltage_v: 16.8, current_a: 0, estimated_flight_time_left_sec: 1800, battery_temp_c: 25 },
    health: { cpu_temp_c: 45, esc_temp_c: 35, imu_ok: true, gps_ok: true, motors_ok: true },
    navigation: { gps_fix_type: '3D', current_waypoint_index: 0, distance_to_wp_m: 0, home_distance_m: 0 },
    sensors: { targets_in_view: [], last_detection: null },
    environment: { wind_speed_ms: 0, wind_dir_deg: 0 },
    payload: { gimbal: { pitch_deg: 0, yaw_deg: 0 }, camera: { recording: false, zoom_factor: 1, stream_url: null } },
  };
}
