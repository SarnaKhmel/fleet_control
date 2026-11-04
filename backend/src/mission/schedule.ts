import { DRONE_COUNT, type DroneStatus, type LatLng, type MissionArea, type StartLayout } from '../../../shared/protocol.js';
import { isInsideArea } from '../../../shared/mission/area.js';

// Timeline of the mission start. All timings are simulated milliseconds since mission_start.
export const STAGGER_MS = 3000;
export const BOOT_MS = 4000;
export const CONNECT_MS = 2000;

export interface DroneSchedule {
  droneId: string;
  callsign: string;
  start: LatLng;
  startAtMs: number;
  bootMs: number;
  connectMs: number;
}

export type StartResult = { ok: true; points: LatLng[] } | { ok: false; reason: 'outside_area' };

/** Start points for each drone, or a reason when a point lies outside the mission area. */
export function resolveStarts(area: MissionArea, layout: StartLayout): StartResult {
  let points: LatLng[];
  switch (layout.kind) {
    case 'single':
      points = Array.from({ length: DRONE_COUNT }, () => layout.point);
      break;
    case 'cluster': {
      // Three drones on a ring of half the radius, so they start close together but not on one point.
      const r = layout.radiusM / 2;
      points = Array.from({ length: DRONE_COUNT }, (_, i) => {
        const angle = (2 * Math.PI * i) / DRONE_COUNT;
        const dLat = (r * Math.cos(angle)) / 110_574;
        const dLng = (r * Math.sin(angle)) / (111_320 * Math.cos((layout.center.lat * Math.PI) / 180));
        return { lat: layout.center.lat + dLat, lng: layout.center.lng + dLng };
      });
      break;
    }
    case 'separate':
      points = layout.points;
      break;
  }
  if (!points.every((p) => isInsideArea(p, area))) return { ok: false, reason: 'outside_area' };
  return { ok: true, points };
}

/** One entry per drone: drones start one after another, every STAGGER_MS. */
export function buildSchedule(starts: LatLng[]): DroneSchedule[] {
  return starts.map((start, i) => ({
    droneId: `drone-${i + 1}`,
    callsign: `BA-0${i + 1}`,
    start,
    startAtMs: i * STAGGER_MS,
    bootMs: BOOT_MS,
    connectMs: CONNECT_MS,
  }));
}

export interface DroneStateAt {
  status: DroneStatus;
  progress: number;
}

/** Drone state after `elapsedMs` of mission time. Online ("idle") from the end of connecting onward. */
export function droneStateAt(entry: DroneSchedule, elapsedMs: number): DroneStateAt {
  const t = elapsedMs - entry.startAtMs;
  if (t < 0) return { status: 'offline', progress: 0 };
  if (t < entry.bootMs) return { status: 'booting', progress: Math.floor((t / entry.bootMs) * 100) };
  if (t < entry.bootMs + entry.connectMs) return { status: 'connecting', progress: 0 };
  return { status: 'idle', progress: 100 };
}
