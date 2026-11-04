import { MAX_TASKS, type ClientMessage, type LatLng, type MissionArea, type ServerMessage, type StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';
import { toMetersFrom } from '../../../shared/mission/area.js';
import { serverLog } from '../log.js';
import { droneStateAt } from './schedule.js';
import { bearingTo, BATTERY_DRAIN_PER_TICK, CLIMB_RATE_MS, DRONE_SPEED_MS, formationTargets, GROUND_AMSL_M, HOVER_ALT_M, SIM_TIME_SCALE, TICK_MS, windStep } from './kinematics.js';

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
  /** Course in degrees when flying a heading instead of a target. */
  course: number | null;
  /** Remaining control points; the drone flies them in order. */
  route: LatLng[];
  /** Path flown for the current task list: where the drone set off, then every point it reached or turned at. */
  trail: LatLng[];
  altitudeM: number;
  batteryPct: number;
  speedMs: number;
  crabDeg: number;
}

// The flown path keeps at most this many points; the oldest are dropped.
export const TRAIL_MAX_POINTS = 50;

/** The path with one more point, unless the drone is still at the last one. */
function withTrailPoint(trail: LatLng[], point: LatLng): LatLng[] {
  const last = trail.at(-1);
  if (last && last.lat === point.lat && last.lng === point.lng) return trail;
  return [...trail, point].slice(-TRAIL_MAX_POINTS);
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
  // Wind at the mission location, as last reported by the dashboard (Open-Meteo, 10 m).
  let wind = { speedMs: 0, fromDeg: 0 };
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
      drones.set(entry.droneId, { position: entry.start, heading: 0, target: null, course: null, route: [], trail: [], altitudeM: GROUND_AMSL_M, batteryPct: 100, speedMs: 0, crabDeg: 0 });
      broadcast({ type: 'drone_online', telemetry: buildTelemetry(entry, now()) });
    });
  }

  /** True when a step of `stepM` meters reaches the target. */
  function distanceReached(from: LatLng, to: LatLng, stepM: number): boolean {
    const { east, north } = toMetersFrom(from, to);
    return Math.hypot(east, north) <= stepM;
  }

  /** One simulated second: climbing drones gain altitude; drones with a target take a step toward it. */
  function tick() {
    for (const [droneId, drone] of drones) {
      const climbing = drone.altitudeM < GROUND_AMSL_M + HOVER_ALT_M;
      if (climbing) drone.altitudeM = Math.min(GROUND_AMSL_M + HOVER_ALT_M, drone.altitudeM + CLIMB_RATE_MS * SIM_TIME_SCALE * (TICK_MS / 1000));
      const moving = drone.target !== null || drone.course !== null;
      if (!moving && !climbing) continue;
      const dtS = (TICK_MS / 1000) * SIM_TIME_SCALE;
      let crabDeg = 0;
      // Flying to a target or along a course: the nose is turned into the wind to hold the ground track.
      const track = drone.target ? bearingTo(drone.position, drone.target) : drone.course;
      if (track !== null) {
        const step = windStep(drone.position, track, wind, DRONE_SPEED_MS, dtS);
        crabDeg = step.crabDeg;
        if (drone.target && distanceReached(drone.position, drone.target, step.groundSpeedMs * dtS)) {
          drone.position = drone.target;
          serverLog('reached', { droneId, point: drone.target, remainingRoute: drone.route.length });
          // Reached a control point: it joins the flown path, and the drone goes on to the next one, if any.
          drone.trail = withTrailPoint(drone.trail, drone.position);
          drone.target = drone.route.shift() ?? null;
        } else {
          drone.position = step.position;
        }
        drone.heading = step.heading;
      }
      drone.speedMs = drone.target || drone.course !== null ? DRONE_SPEED_MS : 0;
      drone.crabDeg = crabDeg;
      drone.batteryPct = Math.max(0, drone.batteryPct - BATTERY_DRAIN_PER_TICK * SIM_TIME_SCALE);
      report(droneId, drone);
    }
  }

  /** Sends the drone's current state, including the point it flies to. */
  function report(droneId: string, drone: DroneState) {
    broadcast({
      type: 'position',
      droneId,
      position: drone.position,
      heading: drone.heading,
      speedMs: drone.speedMs,
      altitudeM: drone.altitudeM,
      batteryPct: drone.batteryPct,
      crabDeg: drone.crabDeg,
      trail: drone.trail,
      tasks: tasksOf(drone),
    });
  }

  /** The drone's task list: the current target first, then the rest of the route. */
  function tasksOf(drone: DroneState): LatLng[] {
    return drone.target ? [drone.target, ...drone.route] : [];
  }

  /**
   * Makes `tasks` the drone's whole list. A new list starts a new flown path from where the drone is;
   * with `turn` the drone keeps its path and turns here (its current task was changed or dropped).
   */
  function setTasks(droneId: string, drone: DroneState, tasks: LatLng[], turn = false) {
    const [first, ...rest] = tasks;
    drone.target = first ?? null;
    drone.route = rest;
    drone.course = null;
    if (turn) drone.trail = withTrailPoint(drone.trail, drone.position);
    else drone.trail = first ? [drone.position] : [];
    // Report at once, so the operator sees the new tasks without waiting for the next tick.
    report(droneId, drone);
  }

  /** Sends the drones to the target in formation: as their only task, or appended to their tasks. */
  function move(droneIds: string[], target: LatLng, append: boolean) {
    const online = droneIds.filter((id) => drones.has(id));
    serverLog('move', { target, append, requested: droneIds, online });
    const targets = formationTargets(target, online.length);
    online.forEach((id, i) => {
      const drone = drones.get(id)!;
      // A drone flying a course has no tasks to append to: the point becomes its only task.
      const current = append && drone.course === null ? tasksOf(drone) : [];
      if (current.length >= MAX_TASKS) return;
      if (current.length > 0) {
        drone.route.push(targets[i]);
        report(id, drone);
      } else {
        setTasks(id, drone, [targets[i]]);
      }
    });
  }

  function setRoute(droneId: string, points: LatLng[]) {
    const drone = drones.get(droneId);
    if (drone) setTasks(droneId, drone, points);
  }

  /** Drops one task; dropping the current one sends the drone on to the next from where it is. */
  function removeTask(droneId: string, index: number) {
    const drone = drones.get(droneId);
    if (!drone) return;
    const tasks = tasksOf(drone);
    if (index >= tasks.length) return;
    serverLog('remove task', { droneId, index });
    if (index === 0) {
      setTasks(droneId, drone, tasks.slice(1), true);
    } else {
      drone.route.splice(index - 1, 1);
      report(droneId, drone);
    }
  }

  /** Moves one task to another point; moving the current one turns the drone toward it from where it is. */
  function updateTask(droneId: string, index: number, point: LatLng) {
    const drone = drones.get(droneId);
    if (!drone) return;
    const tasks = tasksOf(drone);
    if (index >= tasks.length) return;
    serverLog('update task', { droneId, index, point });
    if (index === 0) {
      setTasks(droneId, drone, [point, ...tasks.slice(1)], true);
    } else {
      drone.route[index - 1] = point;
      report(droneId, drone);
    }
  }

  function hold(droneIds: string[]) {
    serverLog('hold', { droneIds });
    for (const id of droneIds) {
      const drone = drones.get(id);
      if (drone) setTasks(id, drone, []);
    }
  }

  function setHeading(droneIds: string[], headingDeg: number) {
    serverLog('heading', { headingDeg, droneIds });
    for (const id of droneIds) {
      const drone = drones.get(id);
      if (drone) {
        drone.course = headingDeg;
        drone.target = null;
        drone.route = [];
        drone.trail = [];
        report(id, drone);
      }
    }
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
        speedMs: live?.speedMs ?? 0,
        batteryPct: live?.batteryPct ?? 100,
        crabDeg: live?.crabDeg ?? 0,
        trail: live?.trail ?? [],
        tasks: live ? tasksOf(live) : [],
      });
    }
    return { type: 'mission_snapshot', running: true, drones: list };
  }

  return {
    snapshot,
    handle(message) {
      serverLog('client message', message.type);
      if (message.type === 'wind') wind = { speedMs: message.speedMs, fromDeg: message.fromDeg };
      else if (message.type === 'mission_start') start(message.area, message.layout);
      else if (message.type === 'mission_reset') {
        stop();
        broadcast({ type: 'mission_reset' });
      } else if (running && message.type === 'move') move(message.droneIds, message.target, message.append === true);
      else if (running && message.type === 'hold') hold(message.droneIds);
      else if (running && message.type === 'remove_task') removeTask(message.droneId, message.index);
      else if (running && message.type === 'update_task') updateTask(message.droneId, message.index, message.point);
      else if (running && message.type === 'heading') setHeading(message.droneIds, message.headingDeg);
      else if (running && message.type === 'route') setRoute(message.droneId, message.points);
    },
    dispose: stop,
  };
}
