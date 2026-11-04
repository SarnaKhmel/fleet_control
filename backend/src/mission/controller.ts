import type { ClientMessage, MissionArea, ServerMessage, StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';

// Interval between "booting" progress messages, simulated ms.
export const PROGRESS_STEP_MS = 1000;

export interface MissionController {
  handle(message: ClientMessage): void;
  dispose(): void;
}

/**
 * Runs the mission start on timers and reports every change through `broadcast`.
 * One mission per server: a second start is refused until mission_reset.
 */
export function createMissionController(
  broadcast: (message: ServerMessage) => void,
  now: () => string = () => new Date().toISOString(),
): MissionController {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let running = false;

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
    later(entry.startAtMs + BOOT_MS + CONNECT_MS, () =>
      broadcast({ type: 'drone_online', telemetry: buildTelemetry(entry, now()) }),
    );
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
    buildSchedule(starts.points).forEach(scheduleDrone);
  }

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    running = false;
    broadcast({ type: 'mission_reset' });
  }

  return {
    handle(message) {
      if (message.type === 'mission_start') start(message.area, message.layout);
      else reset();
    },
    dispose() {
      timers.forEach(clearTimeout);
      timers = [];
      running = false;
    },
  };
}
