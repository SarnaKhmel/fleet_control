import { DEFAULT_ALTITUDE_AGL_M, DEFAULT_CRUISE_SPEED_MS, MAX_TASKS, type ClientMessage, type EngageMode, type CollisionWarning, type DownCause, type FlightStatus, type LatLng, type MissionArea, type ServerMessage, type SnapshotDrone, type StartLayout } from '../../../shared/protocol.js';
import { BOOT_MS, buildSchedule, CONNECT_MS, DroneSchedule, resolveStarts } from './schedule.js';
import { buildTelemetry } from './telemetry.js';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { cellOf, circleCells, CAMERA_RANGE_M, coneCells, RECON_CELL_M, type ReconCell, type ReconGrid } from '../../../shared/mission/recon.js';
import { ALLY_RECON_RADIUS_M, type HitOutcome, type MissionUnit, type UnitSource } from '../../../shared/mission/units.js';
import { generateForces, moveUnit, PlacementError, placementPoints, type ForceUnit, type IsWater } from './forces.js';
import type { Composition } from '../../../shared/mission/composition.js';
import { NO_TERRAIN, type Terrain } from '../terrain/terrain.js';
import { NO_BUILDINGS, type Building, type Buildings } from '../buildings/buildings.js';
import { NO_WATER, type Water } from '../water/water.js';
import { buildingAhead, hitOnStep, WARNING_REAL_S } from './obstacles.js';
import { serverLog } from '../log.js';
import { droneStateAt } from './schedule.js';
import { airDrainPctPerS, groundDrainPctPerS } from '../../../shared/flight/battery.js';
import { bearingTo, CLIMB_RATE_MS, formationTargets, GROUND_AMSL_M, TICK_MS, windStep } from './kinematics.js';
import { MissionClock } from './clock.js';
import type { SimSpeed } from '../../../shared/mission/clock.js';
import { clearTrack, distanceM, drawStrike, pursuitPost } from './engagement.js';
import { DEFAULT_ODDS, type MissionOdds } from '../../../shared/mission/odds.js';

// Interval between "booting" progress messages, ms: several steps per boot, so the bar moves smoothly.
export const PROGRESS_STEP_MS = 250;
// Simulated time is stepped in pieces of at most this many seconds, so a fast clock does not skip the details.
export const SUBSTEP_S = 1;

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
  /** The enemy unit it is attacking, while it is. */
  engagement: Engagement | null;
}

interface Engagement {
  targetId: string;
  mode: EngageMode;
  /** Pursuit: the bearing from the unit the drone came in on; a standing unit is circled from it. */
  sideDeg: number;
  /** Simulated seconds since the engagement began: drives the orbit and the distance swing. */
  clockS: number;
}

/** The drone's status: its phase, and in the air whether it has somewhere to go. */
function statusOf(drone: DroneState): FlightStatus {
  if (drone.phase !== 'air') return drone.phase;
  if (drone.engagement) return 'engaging';
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
  sink: (message: ServerMessage) => void,
  now: () => string = () => new Date().toISOString(),
  terrain: Terrain = NO_TERRAIN,
  buildings: Buildings = NO_BUILDINGS,
  placeForces: (area: MissionArea, starts: LatLng[], isWater: IsWater, odds: MissionOdds, composition: Composition) => ForceUnit[] = (area, starts, isWater, odds, composition) =>
    generateForces(area, starts, Math.random, isWater, odds, composition),
  water: Water = NO_WATER,
  random: () => number = Math.random,
  clockSpeed: SimSpeed = 1,
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
  // The mission clock: simulated time passes with real time, at the operator's speed.
  const clock = new MissionClock();
  clock.speed = clockSpeed;
  // While a tick simulates, its messages are gathered here and sent once it ends (see flush).
  let batch: ServerMessage[] | null = null;
  // Buildings enemy infantry has walked into this mission: each becomes an enemy position once. The count
  // numbers the new enemy units (enemy-N), so an id is never reused.
  const occupied = new Set<Building>();
  let enemyNo = 0;
  let allyNo = 0;
  // The odds the running mission plays with: the operator's, or the defaults.
  let odds: MissionOdds = DEFAULT_ODDS;
  // The units the operator sets up before the start: how many of each kind, and the ones placed by hand.
  let composition: Composition = {};

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
        engagement: null,
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
      drone.engagement = null;
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
    drone.engagement = null;
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
    const passed = clock.advance(TICK_MS);
    if (passed > 0) {
      const steps = Math.ceil(passed / SUBSTEP_S);
      // The ground the cameras see during the tick, and the enemy found in it: once per tick, after its steps.
      const inView = new Map<string, string>();
      batch = [];
      for (let i = 0; i < steps; i++) simulate(passed / steps, inView);
      detect(inView);
      const messages = batch;
      batch = null;
      flush(messages);
    }
    broadcast({ type: 'clock', ...clockView() });
  }

  /**
   * Sends the messages of one tick. A drone's position and its building warning are sent once per tick, the
   * last of each, where that last one came; everything else goes in order.
   */
  function flush(messages: ServerMessage[]) {
    const last = new Map<string, number>();
    messages.forEach((message, index) => {
      const key = coalesceKey(message);
      if (key) last.set(key, index);
    });
    messages.forEach((message, index) => {
      const key = coalesceKey(message);
      if (key && last.get(key) !== index) return;
      sink(message);
    });
  }

  function coalesceKey(message: ServerMessage): string | null {
    if (message.type === 'position') return `position:${message.droneId}`;
    if (message.type === 'drone_warning') return `warning:${message.droneId}`;
    return null;
  }

  /** Sends a message now, or with the tick's block while a tick simulates. */
  function broadcast(message: ServerMessage) {
    if (batch) batch.push(message);
    else sink(message);
  }

  function clockView() {
    return { startedAt: clock.startedAt, simulatedS: clock.simulatedS, speed: clock.speed, paused: clock.paused };
  }

  /** The operator's clock: a speed, a pause, or both. It applies at once and goes out with the change. */
  function setClock(speed: SimSpeed | undefined, paused: boolean | undefined) {
    if (speed !== undefined) clock.speed = speed;
    if (paused !== undefined) clock.paused = paused;
    serverLog('clock', { speed: clock.speed, paused: clock.paused });
    broadcast({ type: 'clock', ...clockView() });
  }

  /** One step of simulated time (dtS seconds): the drones fly and the units move. */
  function simulate(dtS: number, inView: Map<string, string>) {
    const fresh: ReconCell[] = [];
    // Cells in a camera's view this tick, and the first drone that sees each (see tick).
    if (area) {
      for (const unit of forces) moveUnit(unit, area, starts, dtS, Math.random, water.isWater, buildings);
      for (const unit of forces.filter((u) => u.kind === 'infantry' && u.speedMs > 0)) occupy(unit);
    }
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
        if (drone.engagement) {
          if (engageStep(droneId, drone, dtS) === 'down') continue;
        } else {
          const hit = flyStep(droneId, drone, dtS);
          if (hit) {
            // Flew into a building below its top: it is destroyed where it hit.
            drone.position = hit;
            goDown(droneId, drone, 'destroyed', 'collision');
            continue;
          }
        }
      }
      updateWarning(droneId, drone);
      if ((drone.phase === 'air' || drone.phase === 'landing') && reconGrid) {
        // The camera looks along the way it flies, or along the nose while it attacks (the nose is on the unit).
        const cone = coneCells(reconGrid, drone.position, drone.engagement ? drone.heading : drone.heading - drone.crabDeg);
        fresh.push(...markSeen(cone));
        for (const cell of cone) if (!inView.has(cellKey(cell))) inView.set(cellKey(cell), droneId);
      }
      // In the air the drain grows with the airspeed: the cruise speed when flying somewhere, the wind
      // speed when hovering or coming down (it holds its spot against the wind). On the ground: the link only.
      const airspeedMs = drone.target || drone.course !== null || drone.engagement ? drone.cruiseSpeedMs : wind.speedMs;
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
  }

  /**
   * Infantry inside a building takes it: the building becomes a position of the infantry's side where it is,
   * enemy (red) or allied (blue). The first side to take a building holds it for the mission. Ours is known at once.
   */
  function occupy(unit: ForceUnit) {
    const building = buildings.at(unit.position);
    if (!building || occupied.has(building)) return;
    occupied.add(building);
    const ours = unit.side === 'ally';
    const id = ours ? `ally-${++allyNo}` : `enemy-${++enemyNo}`;
    serverLog('building taken', { id, by: unit.id });
    const position: ForceUnit = { id, side: unit.side, kind: 'position', position: unit.position, headingDeg: null, speedMs: 0, intel: ours, band: [0, 0], waypoint: null };
    forces.push(position);
    if (ours) {
      const view = unitView(position, 'intel', null, true);
      known.set(id, view);
      broadcast({ type: 'units', units: [view] });
    }
  }

  /** The ground within 2 km of each of these allies, marked as seen; returns the cells seen for the first time. */
  function watchByAllies(allies: ForceUnit[]): ReconCell[] {
    if (!reconGrid) return [];
    const fresh: ReconCell[] = [];
    for (const ally of allies) fresh.push(...markSeen(circleCells(reconGrid, ally.position, ALLY_RECON_RADIUS_M)));
    return fresh;
  }

  /** True when an ally is near enough to the point to watch it (its 2 km around its place now). */
  function allyCovers(point: LatLng, allies: ForceUnit[]): boolean {
    return allies.some((unit) => {
      const { east, north } = toMetersFrom(unit.position, point);
      return Math.hypot(east, north) <= ALLY_RECON_RADIUS_M;
    });
  }

  /**
   * Enemies in sight: in a drone camera's view this tick, or within 2 km of an ally. One seen for the first
   * time becomes known; a known one in sight is reported where it is now (a standing one only once). When it
   * leaves sight it is reported once more, not in sight, where it was last seen: it does not move on the map.
   */
  function detect(inView: Map<string, string>) {
    if (!reconGrid) return;
    const changed: MissionUnit[] = [];
    // Once per tick, not once per enemy.
    const allies = forces.filter((unit) => unit.side === 'ally');
    for (const unit of forces) {
      if (unit.side === 'ally') {
        // Our own units on the move: the dashboard follows them.
        if (unit.speedMs > 0) {
          const view = unitView(unit, 'intel', null, true);
          known.set(unit.id, view);
          changed.push(view);
        }
        continue;
      }
      const was = known.get(unit.id);
      const droneId = inView.get(cellKey(cellOf(reconGrid, unit.position))) ?? null;
      if (!droneId && !allyCovers(unit.position, allies)) {
        if (was?.inSight) {
          const view = { ...was, inSight: false };
          known.set(unit.id, view);
          changed.push(view);
        }
        continue;
      }
      if (was?.inSight && unit.speedMs === 0) continue;
      if (!was) serverLog('enemy found', { id: unit.id, kind: unit.kind, by: droneId ?? 'ally' });
      const view = unitView(unit, was?.source ?? (droneId ? 'drone' : 'ally'), was ? was.detectedByDroneId : droneId, true);
      known.set(unit.id, view);
      changed.push(view);
    }
    if (changed.length > 0) broadcast({ type: 'units', units: changed });
  }

  function unitView(unit: ForceUnit, source: UnitSource, detectedByDroneId: string | null, inSight: boolean): MissionUnit {
    const { id, side, kind, position, headingDeg, speedMs } = unit;
    return { id, side, kind, position, headingDeg, speedMs, source, detectedByDroneId, inSight, ...(unit.damaged ? { damaged: true } : {}) };
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
    const lookM = drone.cruiseSpeedMs * WARNING_REAL_S * clock.speed;
    const found = drone.phase === 'air' ? buildingAhead(buildings, pathAhead(drone, lookM), lookM, drone.altitudeAglM) : null;
    setWarning(
      droneId,
      drone,
      found && {
        kind: 'building',
        point: found.point,
        distanceM: Math.round(found.distanceM),
        etaS: Math.round(found.distanceM / drone.cruiseSpeedMs / clock.speed),
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

  /** Starts an engagement: the drone drops its tasks and flies at the unit. Refused unless the unit is known. */
  function engage(droneId: string, targetId: string, mode: EngageMode) {
    const drone = commandable(droneId);
    const unit = forces.find((u) => u.id === targetId && u.side === 'enemy');
    const inRange = !!drone && !!unit && (mode === 'strike' || distanceM(drone.position, unit.position) <= CAMERA_RANGE_M);
    if (!drone || !unit || !known.has(targetId) || !inRange) {
      serverLog('engage refused', { droneId, targetId, mode });
      return;
    }
    serverLog('engage', { droneId, targetId, mode });
    takeOff(drone);
    setTasks(droneId, drone, [], true);
    drone.engagement = { targetId, mode, sideDeg: bearingTo(unit.position, drone.position), clockS: 0 };
  }

  /**
   * One step of an engagement: strike flies at the unit, pursuit keeps its post around it. The engagement ends
   * when the unit is gone (or, for a pursuit, out of camera range). Returns 'down' if the drone went down.
   */
  function engageStep(droneId: string, drone: DroneState, dtS: number): 'down' | 'flying' {
    const engagement = drone.engagement!;
    const unit = forces.find((u) => u.id === engagement.targetId);
    if (!unit || (engagement.mode === 'pursuit' && distanceM(drone.position, unit.position) > CAMERA_RANGE_M)) {
      serverLog('engagement over', { droneId, targetId: engagement.targetId });
      drone.engagement = null;
      return 'flying';
    }
    engagement.clockS += dtS;
    return engagement.mode === 'strike' ? strikeStep(droneId, drone, unit, dtS) : pursuitStep(droneId, drone, unit, dtS);
  }

  /** Flies straight at the unit. It is hit when the drone reaches it; if it reaches the place it was last seen and the unit is not there, the strike ends. */
  function strikeStep(droneId: string, drone: DroneState, unit: ForceUnit, dtS: number): 'down' | 'flying' {
    const aim = known.get(unit.id)?.position ?? unit.position;
    const track = bearingTo(drone.position, aim);
    const step = windStep(drone.position, track, wind, drone.cruiseSpeedMs, dtS);
    if (distanceM(drone.position, unit.position) <= step.groundSpeedMs * dtS) {
      // The drone reaches the unit: infantry may shoot it down first; otherwise it strikes and is spent.
      drone.position = unit.position;
      const { outcome, shotDown } = drawStrike(unit.kind, random, odds);
      if (shotDown) {
        goDown(droneId, drone, 'destroyed', 'shot_down');
        return 'down';
      }
      hitUnit(unit, droneId, outcome!);
      goDown(droneId, drone, 'destroyed', 'collision');
      return 'down';
    }
    if (distanceM(drone.position, aim) <= step.groundSpeedMs * dtS && !known.get(unit.id)?.inSight) {
      serverLog('strike lost its target', { droneId, targetId: unit.id });
      drone.position = aim;
      drone.engagement = null;
      return 'flying';
    }
    return flyEngaged(droneId, drone, step.position, step.heading, step.crabDeg, track, dtS);
  }

  /** Keeps its post around the unit (behind it when it moves, circling it when it stands); the nose stays on the unit. */
  function pursuitStep(droneId: string, drone: DroneState, unit: ForceUnit, dtS: number): 'down' | 'flying' {
    const { sideDeg, clockS } = drone.engagement!;
    const post = pursuitPost(unit, sideDeg, clockS);
    const lookM = drone.cruiseSpeedMs * dtS * 2;
    const track = clearTrack(buildings, drone.position, bearingTo(drone.position, post), lookM, drone.altitudeAglM);
    const step = windStep(drone.position, track, wind, drone.cruiseSpeedMs, dtS);
    // Arrives at the post rather than flying past it: a step is far longer than the margin to the range limits.
    const position = distanceM(drone.position, post) <= step.groundSpeedMs * dtS ? post : step.position;
    const nose = bearingTo(drone.position, unit.position);
    // The nose is on the unit, so the way it flies is the crab off it (the camera looks along the nose).
    return flyEngaged(droneId, drone, position, nose, ((nose - track + 540) % 360) - 180, track, dtS);
  }

  /** Moves an engaged drone one step at its cruise speed; a building on the way takes it down. */
  function flyEngaged(droneId: string, drone: DroneState, position: LatLng, heading: number, crabDeg: number, track: number, dtS: number): 'down' | 'flying' {
    const from = drone.position;
    drone.position = position;
    drone.heading = heading;
    drone.crabDeg = crabDeg;
    drone.speedMs = drone.cruiseSpeedMs;
    drone.groundM = groundAt(drone, position);
    holdHeight(drone, track, dtS);
    const hit = hitOnStep(buildings, from, position, drone.altitudeM - drone.groundM);
    if (!hit) return 'flying';
    drone.position = hit;
    goDown(droneId, drone, 'destroyed', 'collision');
    return 'down';
  }

  /**
   * A strike's result on the unit: destroyed leaves the map for good (the drones attacking it lose it on their
   * next step); damaged stays on the map, marked; unharmed changes nothing.
   */
  function hitUnit(unit: ForceUnit, droneId: string, outcome: HitOutcome) {
    serverLog('unit hit', { droneId, unitId: unit.id, outcome });
    if (outcome === 'destroyed') {
      forces.splice(forces.indexOf(unit), 1);
      known.delete(unit.id);
    } else if (outcome === 'damaged') {
      unit.damaged = true;
      const view = known.get(unit.id);
      if (view) known.set(unit.id, { ...view, damaged: true });
    }
    broadcast({ type: 'unit_hit', unitId: unit.id, droneId, outcome });
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
      drone.engagement = null;
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
    drone.engagement = null;
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
      if (drone) {
        drone.engagement = null;
        setTasks(id, drone, []);
      }
    }
  }

  function setHeading(droneIds: string[], headingDeg: number) {
    serverLog('heading', { headingDeg, droneIds });
    for (const id of droneIds) {
      const drone = commandable(id);
      if (drone) {
        takeOff(drone);
        drone.engagement = null;
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
    try {
      forces = placeForces(missionArea, startPoints, water.isWater, odds, composition);
    } catch (error) {
      if (!(error instanceof PlacementError)) throw error;
      // A hand-placed unit breaks the rules: the mission does not start.
      serverLog('placement refused', { side: error.placed.side, kind: error.placed.kind });
      broadcast({ type: 'mission_error', reason: 'bad_placement' });
      stop();
      return;
    }
    enemyNo = forces.filter((u) => u.side === 'enemy').length;
    allyNo = forces.filter((u) => u.side === 'ally').length;
    for (const unit of forces) {
      if (unit.intel) known.set(unit.id, unitView(unit, 'intel', null, unit.side === 'ally'));
    }
    serverLog('forces', { enemies: forces.filter((u) => u.side === 'enemy').length, allies: forces.filter((u) => u.side === 'ally').length, known: known.size });
    const fresh = watchByAllies(forces.filter((unit) => unit.side === 'ally'));
    if (fresh.length > 0) broadcast({ type: 'recon_cells', grid: reconGrid!, cells: fresh });
    if (known.size > 0) broadcast({ type: 'units', units: [...known.values()] });
  }

  function start(area: MissionArea, layout: StartLayout, count: number, missionOdds: MissionOdds, missionComposition: Composition) {
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
    clock.start(now());
    odds = missionOdds;
    composition = missionComposition;
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
    occupied.clear();
    enemyNo = 0;
    allyNo = 0;
    odds = DEFAULT_ODDS;
    composition = {};
    clock.stop();
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
      else if (message.type === 'set_clock') setClock(message.speed, message.paused);
      else if (message.type === 'mission_start') start(message.area, message.layout, message.droneCount, message.odds ?? DEFAULT_ODDS, message.composition ?? {});
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
      else if (running && message.type === 'engage') engage(message.droneId, message.targetId, message.mode);
      // A command can start or stop a drone (idle <-> moving, landing): its new status goes out now.
      for (const [id, drone] of drones) syncStatus(id, drone);
    },
    dispose: stop,
  };
}
