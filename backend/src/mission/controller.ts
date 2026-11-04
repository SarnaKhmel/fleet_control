import { DEFAULT_ALTITUDE_AGL_M, DEFAULT_CRUISE_SPEED_MS, MAX_TASKS, type ClientMessage, type FlightStatus, type LatLng, type MissionArea, type ServerMessage, type SnapshotDrone, type StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { NO_TERRAIN, type Terrain } from '../terrain/terrain.js';
import { serverLog } from '../log.js';
import { droneStateAt } from './schedule.js';
import { bearingTo, BATTERY_DRAIN_PER_TICK, BATTERY_LINK_DRAIN_PER_TICK, CLIMB_RATE_MS, formationTargets, GROUND_AMSL_M, SIM_TIME_SCALE, TICK_MS, windStep } from './kinematics.js';

// Interval between "booting" progress messages, ms: several steps per boot, so the bar moves smoothly.
export const PROGRESS_STEP_MS = 250;

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
  /** Ground elevation under the drone (AMSL): from the terrain, or the last known while its tile loads. */
  groundM: number;
  /** Height above the ground the drone keeps in the air, set by the operator. */
  altitudeAglM: number;
  /** Ground speed the drone flies at, set by the operator. */
  cruiseSpeedMs: number;
  batteryPct: number;
  speedMs: number;
  crabDeg: number;
  /**
   * In the air, coming down, on the ground, or out for good: `lost_link` (battery ran out on the ground)
   * and `destroyed` (ran out in the air) are final. Such a drone keeps its spot, path and tasks.
   */
  phase: 'air' | 'landing' | 'landed' | 'lost_link' | 'destroyed';
  /** The status last sent to clients, so a change is sent once. */
  status: FlightStatus;
}

/** The drone's status: its phase, and in the air whether it has somewhere to go. */
function statusOf(drone: DroneState): FlightStatus {
  if (drone.phase !== 'air') return drone.phase;
  return drone.target || drone.course !== null ? 'moving' : 'idle';
}

// Seconds of flight ahead whose ground the drone looks at to climb in time for rising terrain.
export const LOOKAHEAD_S = 30;

// The flown path keeps at most this many points (as many as a task list); the oldest are dropped.
export const TRAIL_MAX_POINTS = MAX_TASKS;

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
  terrain: Terrain = NO_TERRAIN,
): MissionController {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let startedAt = 0;
  let droneCount = 0;
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
      const groundM = terrain.elevationAt(entry.start) ?? GROUND_AMSL_M;
      const drone: DroneState = {
        position: entry.start,
        heading: 0,
        target: null,
        course: null,
        route: [],
        trail: [],
        altitudeM: groundM,
        groundM,
        altitudeAglM: DEFAULT_ALTITUDE_AGL_M,
        cruiseSpeedMs: DEFAULT_CRUISE_SPEED_MS,
        batteryPct: 100,
        speedMs: 0,
        crabDeg: 0,
        phase: 'air',
        status: 'idle',
      };
      drones.set(entry.droneId, drone);
      broadcast({ type: 'drone_online', telemetry: buildTelemetry(entry, now(), groundM) });
      reportSettings(entry.droneId, drone);
    });
  }

  /** The drone, if it is online and can still take commands. */
  function commandable(droneId: string): DroneState | undefined {
    const drone = drones.get(droneId);
    return drone && drone.phase !== 'lost_link' && drone.phase !== 'destroyed' ? drone : undefined;
  }

  /** Sends the drone's status if it changed since the last one sent. */
  function syncStatus(droneId: string, drone: DroneState) {
    const status = statusOf(drone);
    if (status === drone.status) return;
    drone.status = status;
    serverLog('status', { droneId, status });
    broadcast({ type: 'drone_status', droneId, status });
  }

  /** A grounded or landing drone that is given somewhere to go takes off again. */
  function takeOff(drone: DroneState) {
    drone.phase = 'air';
  }

  /** Lands the drones where they are: their tasks are dropped, their flown path ends at the landing spot. */
  function land(droneIds: string[]) {
    serverLog('land', { droneIds });
    for (const id of droneIds) {
      const drone = commandable(id);
      if (!drone || drone.phase !== 'air') continue;
      drone.phase = 'landing';
      setTasks(id, drone, [], true);
    }
  }

  /**
   * Empty battery: the drone is out for good where it is, `destroyed` if it fell from the air, `lost_link`
   * if it was on the ground. Its flown path ends at that spot and its remaining tasks stay, so the operator
   * sees where it ended and where it was going until the mission ends.
   */
  function goDown(droneId: string, drone: DroneState, phase: 'lost_link' | 'destroyed') {
    serverLog(phase === 'destroyed' ? 'drone destroyed' : 'drone lost link', { droneId, position: drone.position });
    drone.phase = phase;
    drone.speedMs = 0;
    drone.crabDeg = 0;
    drone.altitudeM = drone.groundM;
    drone.trail = withTrailPoint(drone.trail, drone.position);
    report(droneId, drone);
    reportTasks(droneId, drone);
    syncStatus(droneId, drone);
  }

  /** True when a step of `stepM` meters reaches the target. */
  function distanceReached(from: LatLng, to: LatLng, stepM: number): boolean {
    const { east, north } = toMetersFrom(from, to);
    return Math.hypot(east, north) <= stepM;
  }

  /**
   * One simulated second. In the air a drone climbs to hover altitude and steps toward its target or along
   * its course; a landing drone comes down. The battery drains in the air, flying or hovering, and much
   * slower on the ground; when it runs out the drone is out for good.
   */
  function tick() {
    const dtS = (TICK_MS / 1000) * SIM_TIME_SCALE;
    for (const [droneId, drone] of drones) {
      if (drone.phase === 'lost_link' || drone.phase === 'destroyed') continue;
      drone.groundM = groundAt(drone, drone.position);
      if (drone.phase === 'landing') {
        drone.speedMs = 0;
        drone.crabDeg = 0;
        drone.altitudeM = Math.max(drone.groundM, drone.altitudeM - CLIMB_RATE_MS * dtS);
        if (drone.altitudeM === drone.groundM) drone.phase = 'landed';
      } else if (drone.phase === 'landed') {
        drone.altitudeM = drone.groundM;
      } else if (drone.phase === 'air') {
        flyStep(droneId, drone, dtS);
      }
      const drain = drone.phase === 'landed' ? BATTERY_LINK_DRAIN_PER_TICK : BATTERY_DRAIN_PER_TICK;
      drone.batteryPct = Math.max(0, drone.batteryPct - drain * SIM_TIME_SCALE);
      if (drone.batteryPct === 0) {
        goDown(droneId, drone, drone.phase === 'landed' ? 'lost_link' : 'destroyed');
        continue;
      }
      report(droneId, drone);
      syncStatus(droneId, drone);
    }
  }

  /** Ground elevation at a point for this drone: the terrain, or the ground under the drone while unknown. */
  function groundAt(drone: DroneState, point: LatLng): number {
    return terrain.elevationAt(point) ?? drone.groundM;
  }

  /**
   * Holds the set height above the ground. It climbs early for rising ground: the target height counts
   * the highest ground under the drone and LOOKAHEAD_S of flight ahead, and the climb rate is limited.
   * It never goes below the ground under it.
   */
  function holdHeight(drone: DroneState, track: number | null, dtS: number) {
    let ground = drone.groundM;
    if (track !== null) {
      const aheadM = drone.cruiseSpeedMs * LOOKAHEAD_S;
      const rad = (track * Math.PI) / 180;
      for (const share of [0.5, 1]) {
        const point = offsetLatLng(drone.position, aheadM * share * Math.sin(rad), aheadM * share * Math.cos(rad));
        ground = Math.max(ground, groundAt(drone, point));
      }
    }
    const change = ground + drone.altitudeAglM - drone.altitudeM;
    const maxStep = CLIMB_RATE_MS * dtS;
    drone.altitudeM = Math.max(drone.groundM, drone.altitudeM + Math.max(-maxStep, Math.min(maxStep, change)));
  }

  /** A drone in the air: takes a step toward its target or along its course, keeping its height above ground. */
  function flyStep(droneId: string, drone: DroneState, dtS: number) {
    let crabDeg = 0;
    // Flying to a target or along a course: the nose is turned into the wind to hold the ground track.
    const track = drone.target ? bearingTo(drone.position, drone.target) : drone.course;
    if (track !== null) {
      const step = windStep(drone.position, track, wind, drone.cruiseSpeedMs, dtS);
      crabDeg = step.crabDeg;
      if (drone.target && distanceReached(drone.position, drone.target, step.groundSpeedMs * dtS)) {
        drone.position = drone.target;
        serverLog('reached', { droneId, point: drone.target, remainingRoute: drone.route.length });
        // Reached a control point: it joins the flown path, and the drone goes on to the next one, if any.
        drone.trail = withTrailPoint(drone.trail, drone.position);
        drone.target = drone.route.shift() ?? null;
        reportTasks(droneId, drone);
      } else {
        drone.position = step.position;
      }
      drone.heading = step.heading;
    }
    drone.speedMs = drone.target || drone.course !== null ? drone.cruiseSpeedMs : 0;
    drone.crabDeg = crabDeg;
    drone.groundM = groundAt(drone, drone.position);
    holdHeight(drone, drone.target || drone.course !== null ? track : null, dtS);
  }

  /** Sends the drone's position and flight state (many times a second across the fleet: kept small). */
  function report(droneId: string, drone: DroneState) {
    broadcast({
      type: 'position',
      droneId,
      position: drone.position,
      heading: drone.heading,
      speedMs: drone.speedMs,
      altitudeM: drone.altitudeM,
      groundM: drone.groundM,
      batteryPct: drone.batteryPct,
      crabDeg: drone.crabDeg,
    });
  }

  /** Sends the height above ground and cruise speed the drone keeps; called when they change. */
  function reportSettings(droneId: string, drone: DroneState) {
    broadcast({ type: 'drone_settings', droneId, altitudeAglM: drone.altitudeAglM, cruiseSpeedMs: drone.cruiseSpeedMs });
  }

  /** Sets the height above ground and/or cruise speed of the drones that take commands. */
  function setFlight(droneIds: string[], altitudeAglM: number | undefined, cruiseSpeedMs: number | undefined) {
    serverLog('set flight', { droneIds, altitudeAglM, cruiseSpeedMs });
    for (const id of droneIds) {
      const drone = commandable(id);
      if (!drone) continue;
      if (altitudeAglM !== undefined) drone.altitudeAglM = altitudeAglM;
      if (cruiseSpeedMs !== undefined) drone.cruiseSpeedMs = cruiseSpeedMs;
      reportSettings(id, drone);
    }
  }

  /** Sends the drone's task list and flown path; called only when one of them changes. */
  function reportTasks(droneId: string, drone: DroneState) {
    broadcast({ type: 'drone_tasks', droneId, trail: drone.trail, tasks: tasksOf(drone) });
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
    reportTasks(droneId, drone);
  }

  /** Sends the drones to the target in formation: as their only task, or appended to their tasks. */
  function move(droneIds: string[], target: LatLng, append: boolean) {
    const online = droneIds.filter((id) => commandable(id));
    serverLog('move', { target, append, requested: droneIds, online });
    const targets = formationTargets(target, online.length);
    online.forEach((id, i) => {
      const drone = drones.get(id)!;
      takeOff(drone);
      // A drone flying a course has no tasks to append to: the point becomes its only task.
      const current = append && drone.course === null ? tasksOf(drone) : [];
      if (current.length >= MAX_TASKS) return;
      if (current.length > 0) {
        drone.route.push(targets[i]);
        reportTasks(id, drone);
      } else {
        setTasks(id, drone, [targets[i]]);
      }
    });
  }

  function setRoute(droneId: string, points: LatLng[]) {
    const drone = commandable(droneId);
    if (!drone) return;
    takeOff(drone);
    setTasks(droneId, drone, points);
  }

  /** Drops one task; dropping the current one sends the drone on to the next from where it is. */
  function removeTask(droneId: string, index: number) {
    const drone = commandable(droneId);
    if (!drone) return;
    const tasks = tasksOf(drone);
    if (index >= tasks.length) return;
    serverLog('remove task', { droneId, index });
    if (index === 0) {
      setTasks(droneId, drone, tasks.slice(1), true);
    } else {
      drone.route.splice(index - 1, 1);
      reportTasks(droneId, drone);
    }
  }

  /** Moves one task to another point; moving the current one turns the drone toward it from where it is. */
  function updateTask(droneId: string, index: number, point: LatLng) {
    const drone = commandable(droneId);
    if (!drone) return;
    const tasks = tasksOf(drone);
    if (index >= tasks.length) return;
    serverLog('update task', { droneId, index, point });
    if (index === 0) {
      setTasks(droneId, drone, [point, ...tasks.slice(1)], true);
    } else {
      drone.route[index - 1] = point;
      reportTasks(droneId, drone);
    }
  }

  function hold(droneIds: string[]) {
    serverLog('hold', { droneIds });
    for (const id of droneIds) {
      const drone = commandable(id);
      if (drone) setTasks(id, drone, []);
    }
  }

  function setHeading(droneIds: string[], headingDeg: number) {
    serverLog('heading', { headingDeg, droneIds });
    for (const id of droneIds) {
      const drone = commandable(id);
      if (drone) {
        takeOff(drone);
        drone.course = headingDeg;
        drone.target = null;
        drone.route = [];
        drone.trail = [];
        reportTasks(id, drone);
      }
    }
  }

  function start(area: MissionArea, layout: StartLayout, count: number) {
    if (running) {
      broadcast({ type: 'mission_error', reason: 'already_running' });
      return;
    }
    const starts = resolveStarts(area, layout, count);
    if (!starts.ok) {
      broadcast({ type: 'mission_error', reason: starts.reason });
      return;
    }
    running = true;
    droneCount = count;
    startedAt = Date.now();
    schedule = buildSchedule(starts.points);
    // Start loading the ground under the start points, so it is known when the drones come online.
    for (const entry of schedule) terrain.elevationAt(entry.start);
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
    droneCount = 0;
  }

  function snapshot(): ServerMessage {
    if (!running) return { type: 'mission_snapshot', running: false, droneCount: 0, drones: [] };
    const elapsed = Date.now() - startedAt;
    const list: SnapshotDrone[] = [];
    for (const entry of schedule) {
      const state = droneStateAt(entry, elapsed);
      if (state.status === 'offline') continue;
      const live = drones.get(entry.droneId);
      list.push({
        droneId: entry.droneId,
        callsign: entry.callsign,
        status: live ? live.status : (state.status as 'booting' | 'connecting' | 'idle'),
        progress: state.progress,
        position: live?.position ?? null,
        heading: live?.heading ?? null,
        altitudeM: live?.altitudeM ?? null,
        groundM: live?.groundM ?? null,
        altitudeAglM: live?.altitudeAglM ?? DEFAULT_ALTITUDE_AGL_M,
        cruiseSpeedMs: live?.cruiseSpeedMs ?? DEFAULT_CRUISE_SPEED_MS,
        speedMs: live?.speedMs ?? 0,
        batteryPct: live?.batteryPct ?? 100,
        crabDeg: live?.crabDeg ?? 0,
        trail: live?.trail ?? [],
        tasks: live ? tasksOf(live) : [],
      });
    }
    return { type: 'mission_snapshot', running: true, droneCount, drones: list };
  }

  return {
    snapshot,
    handle(message) {
      serverLog('client message', message.type);
      if (message.type === 'wind') wind = { speedMs: message.speedMs, fromDeg: message.fromDeg };
      else if (message.type === 'mission_start') start(message.area, message.layout, message.droneCount);
      else if (message.type === 'mission_reset') {
        stop();
        broadcast({ type: 'mission_reset' });
      } else if (running && message.type === 'move') move(message.droneIds, message.target, message.append === true);
      else if (running && message.type === 'hold') hold(message.droneIds);
      else if (running && message.type === 'remove_task') removeTask(message.droneId, message.index);
      else if (running && message.type === 'update_task') updateTask(message.droneId, message.index, message.point);
      else if (running && message.type === 'heading') setHeading(message.droneIds, message.headingDeg);
      else if (running && message.type === 'land') land(message.droneIds);
      else if (running && message.type === 'set_flight') setFlight(message.droneIds, message.altitudeAglM, message.cruiseSpeedMs);
      else if (running && message.type === 'route') setRoute(message.droneId, message.points);
      // A command can start or stop a drone (idle <-> moving, landing): its new status goes out now.
      for (const [id, drone] of drones) syncStatus(id, drone);
    },
    dispose: stop,
  };
}
