import type { ClientMessage, LatLng, MissionArea, ServerMessage, StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';
import { droneStateAt } from './schedule.js';
import { CLIMB_RATE_MS, DRONE_SPEED_MS, formationTargets, GROUND_AMSL_M, HOVER_ALT_M, stepToward, TICK_MS } from './kinematics.js';

// Interval between "booting" progress messages, simulated ms.
export const PROGRESS_STEP_MS = 1000;

export interface MissionController {
  handle(message: ClientMessage): void;
  /** Current state for a client that connects or reconnects during a mission. */
  snapshot(): ServerMessage;
  dispose(): void;
}

interface DroneState {
  position: LatLng;
  heading: number;
  target: LatLng | null;
  altitudeM: number;
}

/**
 * Runs the mission start on timers, moves online drones toward their targets, and reports every
 * change through `broadcast`. One mission per server: a second start is refused until mission_reset.
 */
export function createMissionController(
  broadcast: (message: ServerMessage) => void,
  now: () => string = () => new Date().toISOString(),
): MissionController {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let startedAt = 0;
  let schedule: DroneSchedule[] = [];
  const drones = new Map<string, DroneState>();

  function later(ms: number, fn: () => void) {
    timers.push(setTimeout(fn, ms));
  }

  function scheduleDrone(entry: DroneSchedule) {
    for (let elapsed = 0; elapsed < BOOT_MS; elapsed += PROGRESS_STEP_MS) {
      later(entry.startAtMs + elapsed, () =>
        broadcast({
          type: 'drone_boot',
          droneId: entry.droneId,
          status: 'booting',
          progress: Math.floor((elapsed / BOOT_MS) * 100),
        }),
      );
    }
    later(entry.startAtMs + BOOT_MS, () =>
      broadcast({ type: 'drone_boot', droneId: entry.droneId, status: 'connecting', progress: 0 }),
    );
    later(entry.startAtMs + BOOT_MS + CONNECT_MS, () => {
      drones.set(entry.droneId, { position: entry.start, heading: 0, target: null, altitudeM: GROUND_AMSL_M });
      broadcast({ type: 'drone_online', telemetry: buildTelemetry(entry, now()) });
    });
  }

  /** One simulated second: climbing drones gain altitude; drones with a target take a step toward it. */
  function tick() {
    for (const [droneId, drone] of drones) {
      const climbing = drone.altitudeM < GROUND_AMSL_M + HOVER_ALT_M;
      if (climbing) drone.altitudeM = Math.min(GROUND_AMSL_M + HOVER_ALT_M, drone.altitudeM + CLIMB_RATE_MS * (TICK_MS / 1000));
      if (!drone.target && !climbing) continue;
      if (drone.target) {
        const step = stepToward(drone.position, drone.target, DRONE_SPEED_MS * (TICK_MS / 1000));
        drone.position = step.position;
        drone.heading = step.heading;
        if (step.arrived) drone.target = null;
      }
      broadcast({
        type: 'position',
        droneId,
        position: drone.position,
        heading: drone.heading,
        speedMs: drone.target ? DRONE_SPEED_MS : 0,
        altitudeM: drone.altitudeM,
      });
    }
  }

  function move(droneIds: string[], target: LatLng) {
    const online = droneIds.filter((id) => drones.has(id));
    const targets = formationTargets(target, online.length);
    online.forEach((id, i) => {
      const drone = drones.get(id);
      if (drone) drone.target = targets[i];
    });
  }

  function start(area: MissionArea, layout: StartLayout) {
    if (running) {
      broadcast({ type: 'mission_error', reason: 'already_running' });
      return;
    }
    const starts = resolveStarts(area, layout);
    if (!starts.ok) {
      broadcast({ type: 'mission_error', reason: starts.reason });
      return;
    }
    running = true;
    startedAt = Date.now();
    schedule = buildSchedule(starts.points);
    schedule.forEach(scheduleDrone);
    ticker = setInterval(tick, TICK_MS);
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    drones.clear();
    running = false;
  }

  function snapshot(): ServerMessage {
    if (!running) return { type: 'mission_snapshot', running: false, drones: [] };
    const elapsed = Date.now() - startedAt;
    const list = [];
    for (const entry of schedule) {
      const state = droneStateAt(entry, elapsed);
      if (state.status === 'offline') continue;
      const live = drones.get(entry.droneId);
      list.push({
        droneId: entry.droneId,
        callsign: entry.callsign,
        status: state.status as 'booting' | 'connecting' | 'idle',
        progress: state.progress,
        position: live?.position ?? null,
        heading: live?.heading ?? null,
        altitudeM: live?.altitudeM ?? null,
      });
    }
    return { type: 'mission_snapshot', running: true, drones: list };
  }

  return {
    snapshot,
    handle(message) {
      if (message.type === 'mission_start') start(message.area, message.layout);
      else if (message.type === 'mission_reset') {
        stop();
        broadcast({ type: 'mission_reset' });
      } else if (running) move(message.droneIds, message.target);
    },
    dispose: stop,
  };
}
