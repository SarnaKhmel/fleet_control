import { DEFAULT_ALTITUDE_AGL_M, DEFAULT_CRUISE_SPEED_MS, MAX_TASKS, type ClientMessage, type CollisionWarning, type DownCause, type FlightStatus, type LatLng, type MissionArea, type ServerMessage, type SnapshotDrone, type StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { cellOf, circleCells, coneCells, RECON_CELL_M, type ReconCell, type ReconGrid } from '../../../shared/mission/recon.js';
import { ALLY_RECON_RADIUS_M, type MissionUnit, type UnitSource } from '../../../shared/mission/units.js';
import { generateForces, moveUnit, placementPoints, type ForceUnit, type IsWater } from './forces.js';
import { NO_TERRAIN, type Terrain } from '../terrain/terrain.js';
import { NO_BUILDINGS, type Buildings } from '../buildings/buildings.js';
import { NO_WATER, type Water } from '../water/water.js';
import { buildingAhead, hitOnStep, WARNING_REAL_S } from './obstacles.js';
import { serverLog } from '../log.js';
import { droneStateAt } from './schedule.js';
import { airDrainPctPerS, groundDrainPctPerS } from '../../../shared/flight/battery.js';
import { bearingTo, CLIMB_RATE_MS, formationTargets, GROUND_AMSL_M, SIM_TIME_SCALE, TICK_MS, windStep } from './kinematics.js';

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
  /** Why it went down for good, once it has. */
  cause: DownCause | null;
  /** The building ahead it will hit, while there is one. */
  warning: CollisionWarning | null;
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
  buildings: Buildings = NO_BUILDINGS,
  placeForces: (area: MissionArea, starts: LatLng[], isWater: IsWater) => ForceUnit[] = (area, starts, isWater) => generateForces(area, starts, Math.random, isWater),
  water: Water = NO_WATER,
): MissionController {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  let running = false;
  // Counts the missions started and stopped: forces placed for a mission that has since ended are dropped.
  let missionNo = 0;
  let startedAt = 0;
  let droneCount = 0;
  // Wind at the mission location, as last reported by the dashboard (Open-Meteo, 10 m).
  let wind = { speedMs: 0, fromDeg: 0 };
  let schedule: DroneSchedule[] = [];
  const drones = new Map<string, DroneState>();
  // Ground the cameras have seen this mission: cells of a grid around the mission area center.
  let reconGrid: ReconGrid | null = null;
  const reconSeen = new Set<string>();
  let reconCells: ReconCell[] = [];
  // The enemy and allies on the ground (all of them, as they really are) and what the dashboard knows of them.
  let area: MissionArea | null = null;
  let starts: LatLng[] = [];
  let forces: ForceUnit[] = [];
  const known = new Map<string, MissionUnit>();

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
        cause: null,
        warning: null,
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
    serverLog('status', { droneId, status, cause: drone.cause });
    broadcast({ type: 'drone_status', droneId, status, ...(drone.cause ? { cause: drone.cause } : {}) });
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
  function goDown(droneId: string, drone: DroneState, phase: 'lost_link' | 'destroyed', cause: DownCause) {
    serverLog(phase === 'destroyed' ? 'drone destroyed' : 'drone lost link', { droneId, cause, position: drone.position });
    drone.phase = phase;
    drone.cause = cause;
    setWarning(droneId, drone, null);
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
    const fresh: ReconCell[] = [];
    // Cells in a camera's view this tick, and the first drone that sees each.
    const inView = new Map<string, string>();
    if (area) for (const unit of forces) moveUnit(unit, area, starts, dtS, Math.random, water.isWater);
    // Allies that moved watch the ground around where they are now.
    const movedAllies = forces.filter((unit) => unit.side === 'ally' && unit.speedMs > 0);
    fresh.push(...watchByAllies(movedAllies));
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
        const hit = flyStep(droneId, drone, dtS);
        if (hit) {
          // Flew into a building below its top: it is destroyed where it hit.
          drone.position = hit;
          goDown(droneId, drone, 'destroyed', 'collision');
          continue;
        }
      }
      updateWarning(droneId, drone);
      if ((drone.phase === 'air' || drone.phase === 'landing') && reconGrid) {
        const cone = coneCells(reconGrid, drone.position, drone.heading - drone.crabDeg);
        fresh.push(...markSeen(cone));
        for (const cell of cone) if (!inView.has(cellKey(cell))) inView.set(cellKey(cell), droneId);
      }
      // In the air the drain grows with the airspeed: the cruise speed when flying somewhere, the wind
      // speed when hovering or coming down (it holds its spot against the wind). On the ground: the link only.
      const airspeedMs = drone.target || drone.course !== null ? drone.cruiseSpeedMs : wind.speedMs;
      const drain = drone.phase === 'landed' ? groundDrainPctPerS() : airDrainPctPerS(airspeedMs);
      drone.batteryPct = Math.max(0, drone.batteryPct - drain * dtS);
      if (drone.batteryPct === 0) {
        goDown(droneId, drone, drone.phase === 'landed' ? 'lost_link' : 'destroyed', 'battery');
        continue;
      }
      report(droneId, drone);
      syncStatus(droneId, drone);
    }
    if (reconGrid && fresh.length > 0) broadcast({ type: 'recon_cells', grid: reconGrid, cells: fresh });
    detect(inView);
  }

  /** The ground within 2 km of each of these allies, marked as seen; returns the cells seen for the first time. */
  function watchByAllies(allies: ForceUnit[]): ReconCell[] {
    if (!reconGrid) return [];
    const fresh: ReconCell[] = [];
    for (const ally of allies) fresh.push(...markSeen(circleCells(reconGrid, ally.position, ALLY_RECON_RADIUS_M)));
    return fresh;
  }

  /** True when an ally is near enough to the point to watch it (its 2 km around its place now). */
  function allyCovers(point: LatLng): boolean {
    return forces.some((unit) => {
      if (unit.side !== 'ally') return false;
      const { east, north } = toMetersFrom(unit.position, point);
      return Math.hypot(east, north) <= ALLY_RECON_RADIUS_M;
    });
  }

  /**
   * Enemies in sight: in a drone camera's view this tick, or in the ground an ally watches. One seen for the
   * first time becomes known; a known one on the move is reported where it is now. Out of sight, the
   * dashboard keeps it where it was last seen.
   */
  function detect(inView: Map<string, string>) {
    if (!reconGrid) return;
    const changed: MissionUnit[] = [];
    for (const unit of forces) {
      if (unit.side === 'ally') {
        // Our own units on the move: the dashboard follows them.
        if (unit.speedMs > 0) {
          const view = unitView(unit, 'intel', null);
          known.set(unit.id, view);
          changed.push(view);
        }
        continue;
      }
      const key = cellKey(cellOf(reconGrid, unit.position));
      const droneId = inView.get(key) ?? null;
      if (!droneId && !allyCovers(unit.position)) continue;
      const was = known.get(unit.id);
      if (was && unit.speedMs === 0) continue;
      if (!was) serverLog('enemy found', { id: unit.id, kind: unit.kind, by: droneId ?? 'ally' });
      const view = unitView(unit, was?.source ?? (droneId ? 'drone' : 'ally'), was ? was.detectedByDroneId : droneId);
      known.set(unit.id, view);
      changed.push(view);
    }
    if (changed.length > 0) broadcast({ type: 'units', units: changed });
  }

  function unitView(unit: ForceUnit, source: UnitSource, detectedByDroneId: string | null): MissionUnit {
    const { id, side, kind, position, headingDeg, speedMs } = unit;
    return { id, side, kind, position, headingDeg, speedMs, source, detectedByDroneId };
  }

  function cellKey(cell: ReconCell): string {
    return `${cell[0]},${cell[1]}`;
  }

  /** Marks the cells as reconnoitred; returns those seen for the first time. */
  function markSeen(cells: ReconCell[]): ReconCell[] {
    const fresh: ReconCell[] = [];
    for (const cell of cells) {
      const key = cellKey(cell);
      if (reconSeen.has(key)) continue;
      reconSeen.add(key);
      reconCells.push(cell);
      fresh.push(cell);
    }
    return fresh;
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

  /** The drone's path ahead: through its target and route, or along its course; empty when it is not moving. */
  function pathAhead(drone: DroneState, lengthM: number): LatLng[] {
    if (drone.target) return [drone.position, drone.target, ...drone.route];
    if (drone.course === null) return [];
    const rad = (drone.course * Math.PI) / 180;
    return [drone.position, offsetLatLng(drone.position, lengthM * Math.sin(rad), lengthM * Math.cos(rad))];
  }

  /**
   * Warns while a building on the path ahead, within WARNING_REAL_S of flight, reaches the drone's set
   * height (minus a clearance). Sent every tick while it lasts, so the time to impact counts down; cleared once.
   */
  function updateWarning(droneId: string, drone: DroneState) {
    const lookM = drone.cruiseSpeedMs * WARNING_REAL_S * SIM_TIME_SCALE;
    const found = drone.phase === 'air' ? buildingAhead(buildings, pathAhead(drone, lookM), lookM, drone.altitudeAglM) : null;
    setWarning(
      droneId,
      drone,
      found && {
        kind: 'building',
        point: found.point,
        distanceM: Math.round(found.distanceM),
        etaS: Math.round(found.distanceM / drone.cruiseSpeedMs / SIM_TIME_SCALE),
        heightM: found.building.heightM,
      },
    );
  }

  function setWarning(droneId: string, drone: DroneState, warning: CollisionWarning | null) {
    if (!warning && !drone.warning) return;
    if (warning && !drone.warning) serverLog('collision warning', { droneId, warning });
    drone.warning = warning;
    broadcast({ type: 'drone_warning', droneId, warning });
  }

  /**
   * A drone in the air: takes a step toward its target or along its course, keeping its height above ground.
   * Returns where it flew into a building on the way, or null.
   */
  function flyStep(droneId: string, drone: DroneState, dtS: number): LatLng | null {
    const from = drone.position;
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
    return drone.position === from ? null : hitOnStep(buildings, from, drone.position, drone.altitudeM - drone.groundM);
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

  /**
   * Places the enemy and allies. The allies and the enemy known from intelligence are sent at once; the
   * ground the allies watch is reconnoitred from the start.
   */
  function deployForces(missionArea: MissionArea, startPoints: LatLng[]) {
    area = missionArea;
    starts = startPoints;
    forces = placeForces(missionArea, startPoints, water.isWater);
    for (const unit of forces) {
      if (unit.intel) known.set(unit.id, unitView(unit, 'intel', null));
    }
    serverLog('forces', { enemies: forces.filter((u) => u.side === 'enemy').length, allies: forces.filter((u) => u.side === 'ally').length, known: known.size });
    const fresh = watchByAllies(forces.filter((unit) => unit.side === 'ally'));
    if (fresh.length > 0) broadcast({ type: 'recon_cells', grid: reconGrid!, cells: fresh });
    if (known.size > 0) broadcast({ type: 'units', units: [...known.values()] });
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
    const no = ++missionNo;
    droneCount = count;
    reconGrid = { origin: area.center, cellM: RECON_CELL_M };
    // The units go out once the water around the start points is known, so none is placed on water.
    void water.loaded(placementPoints(starts.points)).then(() => {
      if (running && no === missionNo) deployForces(area, starts.points);
    });
    startedAt = Date.now();
    schedule = buildSchedule(starts.points);
    // Start loading the ground under the start points, so it is known when the drones come online.
    for (const entry of schedule) terrain.elevationAt(entry.start);
    schedule.forEach(scheduleDrone);
    ticker = setInterval(tick, TICK_MS);
  }

  function stop() {
    missionNo++;
    timers.forEach(clearTimeout);
    timers = [];
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    drones.clear();
    reconGrid = null;
    reconSeen.clear();
    reconCells = [];
    area = null;
    starts = [];
    forces = [];
    known.clear();
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
        ...(live?.cause ? { cause: live.cause } : {}),
        warning: live?.warning ?? null,
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
    return { type: 'mission_snapshot', running: true, droneCount, drones: list, ...(reconGrid ? { recon: { grid: reconGrid, cells: reconCells } } : {}), units: [...known.values()] };
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
