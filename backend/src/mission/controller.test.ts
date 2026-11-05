import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TASKS, type LatLng, type ServerMessage } from '../../../shared/protocol.js';
import { createMissionController as createAtSpeed } from './controller.js';

// Most of these tests were written for the simulation at 10 times real time (a tick is 10 simulated seconds).
// They keep those numbers: the clock is set to 10 when the controller is made. The clock tests set their own speed.
const createMissionController = (...args: Parameters<typeof createAtSpeed> extends [...infer P] ? P : never) =>
  createAtSpeed(args[0], args[1], args[2], args[3], args[4], args[5], args[6], 10);
import { NO_TERRAIN, type Terrain } from '../terrain/terrain.js';
import type { Building, Buildings } from '../buildings/buildings.js';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import { distanceM } from './engagement.js';
import { PlacementError } from './forces.js';
import { DEFAULT_ODDS, type MissionOdds } from '../../../shared/mission/odds.js';
import { DEFAULT_ALLY_COUNTS, DEFAULT_ENEMY_COUNTS } from '../../../shared/mission/composition.js';
import { bearingTo } from './kinematics.js';
import { CONNECT_MS, BOOT_MS, STAGGER_MS } from './schedule.js';
import type { ForceUnit } from './forces.js';

const area = { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 };
const single = { kind: 'single' as const, point: { lat: 50, lng: 30 } };

describe('mission controller', () => {
  let sent: ServerMessage[];
  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it('boots drones one after another and brings each online', () => {
    const mission = createMissionController((m) => sent.push(m), () => '2026-11-04T12:00:00Z');
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });

    vi.advanceTimersByTime(STAGGER_MS + BOOT_MS + CONNECT_MS);

    const online = sent.filter((m) => m.type === 'drone_online');
    expect(online.map((m) => (m.type === 'drone_online' ? m.telemetry.meta.callsign : ''))).toEqual(['BA-01', 'BA-02']);
    expect(sent.some((m) => m.type === 'drone_boot' && m.droneId === 'drone-2' && m.status === 'booting')).toBe(true);
    mission.dispose();
  });

  it('refuses a second start while a mission runs', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    expect(sent).toContainEqual({ type: 'mission_error', reason: 'already_running' });
    mission.dispose();
  });

  it('reports a start outside the mission area and does not run it', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: { kind: 'single', point: { lat: 52, lng: 30 } }, droneCount: 3 });
    expect(sent).toEqual([{ type: 'mission_error', reason: 'outside_area' }]);
    mission.dispose();
  });

  it('reset stops pending timers and announces the reset', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    mission.handle({ type: 'mission_reset' });
    sent = [];
    vi.advanceTimersByTime(60_000);
    expect(sent).toEqual([]);
    mission.dispose();
  });

  it('allows a new mission after reset', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    mission.handle({ type: 'mission_reset' });
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    expect(sent.some((m) => m.type === 'mission_error')).toBe(false);
    mission.dispose();
  });

  it('brings all three drones online within four seconds', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(4000);
    expect(sent.filter((m) => m.type === 'drone_online')).toHaveLength(3);
    mission.dispose();
  });

  it('starts as many drones as the operator asked for, and tells a reconnecting client how many', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 12 });
    vi.advanceTimersByTime(11 * STAGGER_MS + BOOT_MS + CONNECT_MS);
    const online = sent.filter((m) => m.type === 'drone_online').map((m) => (m.type === 'drone_online' ? m.telemetry.meta.callsign : ''));
    expect(online).toHaveLength(12);
    expect(online.at(-1)).toBe('BA-12');
    const snap = mission.snapshot();
    expect(snap.type === 'mission_snapshot' && snap.droneCount).toBe(12);
    mission.dispose();
  });

  it('moves an online drone toward a target and reports positions', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
    sent = [];
    mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
    vi.advanceTimersByTime(3000);
    const positions = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1');
    expect(positions.length).toBeGreaterThanOrEqual(3);
    const last = positions[positions.length - 1];
    expect(last.type === 'position' && last.position.lat).toBeGreaterThan(50.0);
    mission.dispose();
  });

  it('ignores move for drones that are not online yet', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
    // Once online, the drone only climbs: the move it got while booting was not kept.
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS + 3000);
    const last = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1').at(-1);
    expect(last && last.type === 'position' && last.position).toEqual(single.point);
    expect(sent.some((m) => m.type === 'drone_tasks')).toBe(false);
    mission.dispose();
  });

  it('climbs an online drone to hover altitude before it is given a move', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
    sent = [];
    vi.advanceTimersByTime(5000);
    const altitudes = sent.filter((m) => m.type === 'position').map((m) => (m.type === 'position' ? m.altitudeM : 0));
    expect(altitudes.length).toBeGreaterThan(0);
    expect(altitudes[altitudes.length - 1]).toBeGreaterThan(150);
    vi.advanceTimersByTime(60_000);
    const last = sent.filter((m) => m.type === 'position').at(-1);
    expect(last && last.type === 'position' && last.altitudeM).toBe(210);
    mission.dispose();
  });

  describe('drone status', () => {
    const lastOf = <T extends ServerMessage['type']>(type: T) => sent.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }>;
    const statuses = () => sent.filter((m) => m.type === 'drone_status').map((m) => (m.type === 'drone_status' ? m.status : ''));
    const statusOf = (mission: ReturnType<typeof createMissionController>) => {
      const snap = mission.snapshot();
      return snap.type === 'mission_snapshot' ? snap.drones[0] : undefined;
    };
    function online() {
      const mission = createMissionController((m) => sent.push(m));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      sent = [];
      return mission;
    }

    it('is moving while it flies its tasks and idle once they are done, sent once per change', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.005, lng: 30 } });
      expect(statuses()).toEqual(['moving']);
      vi.advanceTimersByTime(30_000);
      expect(statuses()).toEqual(['moving', 'idle']);
      expect(statusOf(mission)?.status).toBe('idle');
      mission.dispose();
    });

    it('drains the battery while hovering, too', () => {
      const mission = online();
      vi.advanceTimersByTime(60_000);
      expect(lastOf('position').batteryPct).toBeLessThan(96);
      mission.dispose();
    });

    it('drains faster at a higher speed and when hovering against the wind', () => {
      // A minute of real time is 600 simulated seconds.
      const used = (setup: (mission: ReturnType<typeof createMissionController>) => void) => {
        sent = [];
        const mission = online();
        setup(mission);
        const before = lastOf('position')?.batteryPct ?? 100;
        vi.advanceTimersByTime(60_000);
        const after = lastOf('position').batteryPct;
        mission.dispose();
        return before - after;
      };
      const calmHover = used(() => {});
      const windyHover = used((m) => m.handle({ type: 'wind', speedMs: 8, fromDeg: 0 }));
      const cruise10 = used((m) => m.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 51, lng: 30 } }));
      const cruise20 = used((m) => {
        m.handle({ type: 'set_flight', droneIds: ['drone-1'], cruiseSpeedMs: 20 });
        m.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 51, lng: 30 } });
      });
      expect(calmHover).toBeCloseTo(15, 0); // 60 % of 25 %
      expect(windyHover).toBeCloseTo(21.4, 0);
      expect(cruise10).toBeCloseTo(25, 0);
      expect(cruise20).toBeCloseTo(55, 0);
    });

    it('lands where it is: drops its tasks, ends its path there and comes down to the ground', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 51, lng: 30 } });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'land', droneIds: ['drone-1'] });
      const spot = lastOf('position').position;
      expect(statuses().at(-1)).toBe('landing');
      expect(lastOf('drone_tasks')).toMatchObject({ tasks: [], trail: [{ lat: 50, lng: 30 }, spot] });
      vi.advanceTimersByTime(10_000);
      expect(statuses()).toEqual(['moving', 'landing', 'landed']);
      expect(lastOf('position')).toMatchObject({ position: spot, altitudeM: 150, speedMs: 0 });
      mission.dispose();
    });

    it('draws 20 times less power on the ground', () => {
      const mission = online();
      mission.handle({ type: 'land', droneIds: ['drone-1'] });
      vi.advanceTimersByTime(10_000);
      const before = lastOf('position').batteryPct;
      vi.advanceTimersByTime(60_000);
      const groundUse = before - lastOf('position').batteryPct;
      // In the air a minute of real time (10 simulated) uses 25 %; on the ground 1.25 %.
      expect(groundUse).toBeCloseTo(1.25, 5);
      mission.dispose();
    });

    it('takes off again when a landed drone is given a point', () => {
      const mission = online();
      mission.handle({ type: 'land', droneIds: ['drone-1'] });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'land', droneIds: ['drone-1'] }); // already down: nothing changes
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30 } });
      vi.advanceTimersByTime(3000);
      expect(statuses()).toEqual(['landing', 'landed', 'moving']);
      expect(lastOf('position').altitudeM).toBeGreaterThan(150);
      mission.dispose();
    });

    describe('empty battery', () => {
      // A long flight: the drone runs dry long before it reaches the far points.
      function flyUntilEmpty() {
        const mission = online();
        mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 51, lng: 30 } });
        mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 52, lng: 30 }, append: true });
        vi.advanceTimersByTime(10 * 60_000);
        return mission;
      }

      it('in the air: the drone falls where it ran dry and is destroyed', () => {
        const mission = flyUntilEmpty();
        expect(statuses()).toEqual(['moving', 'destroyed']);
        expect(lastOf('drone_status')).toMatchObject({ status: 'destroyed', cause: 'battery' });
        const crash = lastOf('position');
        expect(crash).toMatchObject({ batteryPct: 0, speedMs: 0, altitudeM: 150 });
        // It lies there: no more positions after the fall.
        expect(sent.findIndex((m) => m.type === 'drone_status' && m.status === 'destroyed')).toBeGreaterThan(sent.lastIndexOf(crash));
        mission.dispose();
      });

      it('in the air: keeps the path flown up to the crash and the tasks it did not reach', () => {
        const mission = flyUntilEmpty();
        const crash = lastOf('position').position;
        expect(lastOf('drone_tasks').trail.at(-1)).toEqual(crash);
        expect(lastOf('drone_tasks').tasks).toEqual([{ lat: 51, lng: 30 }, { lat: 52, lng: 30 }]);
        expect(statusOf(mission)).toMatchObject({ status: 'destroyed', position: crash });
        expect(statusOf(mission)?.tasks).toHaveLength(2);
        mission.dispose();
      });

      it('on the ground: the drone stays intact but loses its link', () => {
        const mission = online();
        mission.handle({ type: 'land', droneIds: ['drone-1'] });
        vi.advanceTimersByTime(90 * 60_000);
        expect(statuses()).toEqual(['landing', 'landed', 'lost_link']);
        expect(statusOf(mission)?.status).toBe('lost_link');
        mission.dispose();
      });

      it('takes no more commands once destroyed', () => {
        const mission = flyUntilEmpty();
        sent = [];
        mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50, lng: 30 } });
        mission.handle({ type: 'hold', droneIds: ['drone-1'] });
        mission.handle({ type: 'land', droneIds: ['drone-1'] });
        mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 0 });
        mission.handle({ type: 'update_task', droneId: 'drone-1', index: 0, point: { lat: 50, lng: 30 } });
        mission.handle({ type: 'heading', droneIds: ['drone-1'], headingDeg: 90 });
        mission.handle({ type: 'set_flight', droneIds: ['drone-1'], altitudeAglM: 100 });
        vi.advanceTimersByTime(5000);
        // Only the mission clock goes on each tick; the drone sends nothing.
        expect(sent.filter((m) => m.type !== 'clock')).toEqual([]);
        mission.dispose();
      });
    });
  });

  describe('height and speed', () => {
    const positions = () => sent.filter((m) => m.type === 'position') as Extract<ServerMessage, { type: 'position' }>[];
    function online(terrain: Terrain) {
      const mission = createMissionController((m) => sent.push(m), undefined, terrain);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      return mission;
    }

    it('takes off from the ground the terrain gives and holds the set height above it', () => {
      const mission = online({ elevationAt: () => 300 });
      const first = sent.find((m) => m.type === 'drone_online');
      expect(first?.type === 'drone_online' && first.telemetry.position_and_kinematics.gps.altitude_amsl_m).toBe(300);
      expect(sent.find((m) => m.type === 'drone_settings')).toEqual({ type: 'drone_settings', droneId: 'drone-1', altitudeAglM: 60, cruiseSpeedMs: 10 });
      vi.advanceTimersByTime(10_000);
      expect(positions().at(-1)).toMatchObject({ altitudeM: 360, groundM: 300 });
      mission.handle({ type: 'set_flight', droneIds: ['drone-1'], altitudeAglM: 200 });
      expect(sent.at(-1)).toEqual({ type: 'drone_settings', droneId: 'drone-1', altitudeAglM: 200, cruiseSpeedMs: 10 });
      vi.advanceTimersByTime(10_000);
      expect(positions().at(-1)?.altitudeM).toBe(500);
      mission.dispose();
    });

    it('follows rising and falling ground, climbing early enough to keep its height', () => {
      // A ridge north of the start: up 10 % from 200 m, then down again past 50.04.
      const ridge = (lat: number) => 200 + Math.max(0, Math.min(lat - 50.01, 50.07 - lat)) * 111_000 * 0.1;
      const mission = online({ elevationAt: (p) => ridge(p.lat) });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.08, lng: 30 } });
      sent = [];
      vi.advanceTimersByTime(120_000);
      const heights = positions().map((m) => m.altitudeM - ridge(m.position.lat));
      expect(Math.min(...heights)).toBeGreaterThan(55);
      expect(positions().every((m) => m.groundM === ridge(m.position.lat))).toBe(true);
      expect(positions().at(-1)?.altitudeM).toBeCloseTo(260, 0);
      mission.dispose();
    });

    it('starts climbing before a slope too steep to climb on the spot', () => {
      // 50 % up for 400 m: steeper than the climb rate allows at cruise speed, so it must start early.
      const ramp = (lat: number) => 200 + Math.max(0, Math.min((lat - 50.02) * 111_000, 400)) * 0.5;
      const mission = online({ elevationAt: (p) => ramp(p.lat) });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30 } });
      sent = [];
      vi.advanceTimersByTime(60_000);
      const heights = positions().map((m) => m.altitudeM - ramp(m.position.lat));
      expect(Math.min(...heights)).toBeGreaterThan(30);
      mission.dispose();
    });

    it('never flies into the ground, even at a cliff too steep to climb in time', () => {
      const cliff = (lat: number) => (lat > 50.02 ? 600 : 200);
      const mission = online({ elevationAt: (p) => cliff(p.lat) });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30 } });
      sent = [];
      vi.advanceTimersByTime(60_000);
      expect(positions().every((m) => m.altitudeM >= cliff(m.position.lat))).toBe(true);
      mission.dispose();
    });

    it('keeps the last known ground while the terrain under it is still unknown', () => {
      let known = true;
      const mission = online({ elevationAt: () => (known ? 300 : null) });
      vi.advanceTimersByTime(10_000);
      known = false;
      vi.advanceTimersByTime(5000);
      expect(positions().at(-1)).toMatchObject({ altitudeM: 360, groundM: 300 });
      mission.dispose();
    });

    it('flies at the cruise speed set for it', () => {
      const mission = online(NO_TERRAIN);
      mission.handle({ type: 'set_flight', droneIds: ['drone-1'], cruiseSpeedMs: 25 });
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 51, lng: 30 } });
      sent = [];
      vi.advanceTimersByTime(3000);
      const [a, b] = positions().slice(-2);
      expect(b.speedMs).toBe(25);
      const { north } = toMetersFrom(a.position, b.position);
      expect(north).toBeCloseTo(250, 0); // 25 m/s for 10 simulated seconds
      mission.dispose();
    });

    it('lands on the ground under it', () => {
      const mission = online({ elevationAt: () => 420 });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'land', droneIds: ['drone-1'] });
      vi.advanceTimersByTime(10_000);
      expect(positions().at(-1)).toMatchObject({ altitudeM: 420, groundM: 420, speedMs: 0 });
      mission.dispose();
    });

    it('gives the ground, height and speed settings in the snapshot', () => {
      const mission = online({ elevationAt: () => 300 });
      mission.handle({ type: 'set_flight', droneIds: ['drone-1'], altitudeAglM: 120, cruiseSpeedMs: 15 });
      const snap = mission.snapshot();
      expect(snap.type === 'mission_snapshot' && snap.drones[0]).toMatchObject({ groundM: 300, altitudeAglM: 120, cruiseSpeedMs: 15 });
      mission.dispose();
    });
  });

  describe('buildings', () => {
    // A 70 m tower 2 km north of the start, across the whole width of the path.
    const tower: Buildings = {
      at: (p) => (p.lat > 50.018 && p.lat < 50.0185 && Math.abs(p.lng - 30) < 0.01 ? ({ rings: [], heightM: 70, south: 0, north: 0, west: 0, east: 0 } as Building) : null),
    };
    const warnings = () => sent.filter((m) => m.type === 'drone_warning') as Extract<ServerMessage, { type: 'drone_warning' }>[];
    function flyNorth() {
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, tower);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS + 3000);
      sent = [];
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30 } });
      return mission;
    }

    it('warns of a building at its height ahead, counting down the time to impact', () => {
      const mission = flyNorth();
      // 2 km at 10 m/s is 200 simulated seconds, 20 real ones: right at the edge of the warning window.
      vi.advanceTimersByTime(3000);
      const [first, second] = warnings();
      expect(first.warning).toMatchObject({ kind: 'building', heightM: 70 });
      expect(second.warning!.etaS).toBe(first.warning!.etaS - 1);
      expect(second.warning!.distanceM).toBeCloseTo(first.warning!.distanceM - 100, -1);
      expect(mission.snapshot()).toMatchObject({ drones: [{ warning: { kind: 'building', heightM: 70 } }] });
      mission.dispose();
    });

    it('clears the warning once the operator sends the drone above the building', () => {
      const mission = flyNorth();
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'set_flight', droneIds: ['drone-1'], altitudeAglM: 100 });
      vi.advanceTimersByTime(1000);
      expect(warnings().at(-1)?.warning).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(sent.some((m) => m.type === 'drone_status' && m.status === 'destroyed')).toBe(false);
      mission.dispose();
    });

    it('is destroyed where it flies into the building if nothing is done, keeping its tasks', () => {
      const mission = flyNorth();
      vi.advanceTimersByTime(30_000);
      const down = sent.find((m) => m.type === 'drone_status' && m.status === 'destroyed');
      expect(down).toEqual({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed', cause: 'collision' });
      const crash = sent.filter((m) => m.type === 'position').at(-1) as Extract<ServerMessage, { type: 'position' }>;
      expect(crash.position.lat).toBeGreaterThan(50.018);
      expect(crash.position.lat).toBeLessThan(50.0185);
      expect(warnings().at(-1)?.warning).toBeNull();
      expect(mission.snapshot()).toMatchObject({ drones: [{ status: 'destroyed', cause: 'collision', warning: null, tasks: [{ lat: 50.05, lng: 30 }] }] });
      mission.dispose();
    });

    it('gives no warning to a hovering drone or one above the building', () => {
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, tower);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      mission.handle({ type: 'set_flight', droneIds: ['drone-1'], altitudeAglM: 90 });
      vi.advanceTimersByTime(10_000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30 } });
      vi.advanceTimersByTime(40_000);
      expect(warnings()).toEqual([]);
      mission.dispose();
    });
  });

  describe('reconnaissance', () => {
    const reconMessages = () => sent.filter((m) => m.type === 'recon_cells') as Extract<ServerMessage, { type: 'recon_cells' }>[];
    const allCells = () => reconMessages().flatMap((m) => m.cells.map(([x, y]) => `${x},${y}`));
    function online() {
      // No enemy or allies: an ally would reconnoitre the ground around it from the start.
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => []);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      return mission;
    }

    it('marks the ground ahead of a flying drone, sending each cell only once', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.1, lng: 30 } });
      vi.advanceTimersByTime(20_000);
      const cells = allCells();
      // A 60 degree cone of 600 m is about 190 cells of 100 m.
      expect(cells.length).toBeGreaterThan(120);
      expect(new Set(cells).size).toBe(cells.length);
      expect(reconMessages()[0].grid).toEqual({ origin: area.center, cellM: 100 });
      // The drone flies north from the center: what it saw lies north of the start, none of it far south.
      const rows = cells.map((c) => Number(c.split(',')[1]));
      expect(Math.max(...rows)).toBeGreaterThan(4);
      expect(Math.min(...rows)).toBeGreaterThan(-3);
      mission.dispose();
    });

    it('marks nothing new while a hovering drone looks at the same ground', () => {
      const mission = online();
      vi.advanceTimersByTime(3000);
      const before = allCells().length;
      vi.advanceTimersByTime(10_000);
      expect(allCells().length).toBe(before);
      mission.dispose();
    });

    it('gives everything seen in the snapshot, and forgets it on reset', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.05, lng: 30.05 } });
      vi.advanceTimersByTime(10_000);
      const snap = mission.snapshot();
      expect(snap.type === 'mission_snapshot' && snap.recon?.cells.map(([x, y]) => `${x},${y}`).sort()).toEqual(allCells().sort());
      mission.handle({ type: 'mission_reset' });
      expect(mission.snapshot()).toEqual({ type: 'mission_snapshot', running: false, droneCount: 0, drones: [] });
      mission.dispose();
    });

  });

  // Lets the pending promises run (the units are placed once the water is known).
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  describe('enemy and allies', () => {
    const unitMessages = () => sent.filter((m) => m.type === 'units') as Extract<ServerMessage, { type: 'units' }>[];
    const sentUnits = () => unitMessages().flatMap((m) => m.units);
    const force = (over: Partial<ForceUnit>): ForceUnit => ({
      id: 'enemy-1', side: 'enemy', kind: 'infantry', position: area.center, headingDeg: null, speedMs: 0, intel: false, band: [0, 100_000], waypoint: null, ...over,
    });
    // The units go out once the water around the start points is known: a few microtasks later.
    async function online(forces: ForceUnit[]) {
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => forces.map((f) => ({ ...f })));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      await settle();
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      return mission;
    }

    it('waits for the water around the start points before it places the units, and places them on land', async () => {
      let loaded: () => void = () => {};
      const water = { isWater: (p: LatLng) => p.lat > 50.5, loaded: () => new Promise<void>((resolve) => (loaded = resolve)) };
      const placed: ((p: LatLng) => boolean)[] = [];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, (_area, _starts, isWater) => {
        placed.push(isWater);
        return [];
      }, water);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      await settle();
      expect(placed).toEqual([]);
      loaded();
      await settle();
      expect(placed).toHaveLength(1);
      expect(placed[0]).toBe(water.isWater);
      mission.dispose();
    });

    it('sends the allies and the enemy known from intelligence at the start, and hides the rest', async () => {
      const ally = force({ id: 'ally-1', side: 'ally', position: offsetLatLng(area.center, 0, -20_000), intel: true });
      const known = force({ id: 'enemy-1', kind: 'artillery', position: offsetLatLng(area.center, 0, 30_000), intel: true });
      const hidden = force({ id: 'enemy-2', position: offsetLatLng(area.center, 0, 40_000) });
      const mission = await online([known, hidden, ally]);
      expect(unitMessages()).toHaveLength(1);
      expect(sentUnits().map((u) => [u.id, u.source])).toEqual([['enemy-1', 'intel'], ['ally-1', 'intel']]);
      expect(sentUnits()[0]).toEqual({ id: 'enemy-1', side: 'enemy', kind: 'artillery', position: known.position, headingDeg: null, speedMs: 0, source: 'intel', detectedByDroneId: null, inSight: false });
      const snap = mission.snapshot();
      expect(snap.type === 'mission_snapshot' && snap.units?.map((u) => u.id)).toEqual(['enemy-1', 'ally-1']);
      mission.handle({ type: 'mission_reset' });
      expect(mission.snapshot()).toEqual({ type: 'mission_snapshot', running: false, droneCount: 0, drones: [] });
      mission.dispose();
    });

    it('reconnoitres the 800 m around each ally from the start', async () => {
      const mission = await online([force({ id: 'ally-1', side: 'ally', position: offsetLatLng(area.center, 0, -20_000), intel: true })]);
      const recon = sent.filter((m) => m.type === 'recon_cells') as Extract<ServerMessage, { type: 'recon_cells' }>[];
      const cells = recon[0].cells;
      // A circle of 800 m is about 200 cells of 100 m, 20 km south.
      expect(cells.length).toBeGreaterThan(180);
      expect(cells.length).toBeLessThan(220);
      expect(cells.every(([, y]) => y >= -209 && y <= -191)).toBe(true);
      mission.dispose();
    });

    it('finds a hidden enemy once a drone camera sees it, and names the drone', async () => {
      const enemy = force({ position: offsetLatLng(area.center, 1000, 0) }); // 1 km east, straight ahead of the drone that flies east
      const mission = await online([enemy]);
      vi.advanceTimersByTime(5000);
      expect(sentUnits()).toEqual([]);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: offsetLatLng(area.center, 5000, 0) });
      // Flying east (100 m per real second of the simulation), the camera's 600 m reach it after about 4 s.
      vi.advanceTimersByTime(6000);
      expect(sentUnits()).toEqual([expect.objectContaining({ id: 'enemy-1', source: 'drone', detectedByDroneId: 'drone-1', position: enemy.position })]);
      // A unit that stands is sent once, not again while the camera keeps seeing it.
      vi.advanceTimersByTime(3000);
      expect(sentUnits()).toHaveLength(1);
      mission.dispose();
    });

    it('finds an enemy within 800 m of an ally', async () => {
      const allyAt = offsetLatLng(area.center, 0, -20_000);
      const mission = await online([
        force({ id: 'ally-1', side: 'ally', position: allyAt, intel: true }),
        force({ id: 'enemy-1', position: offsetLatLng(allyAt, 0, 500) }),
        force({ id: 'enemy-2', position: offsetLatLng(allyAt, 0, 900) }),
      ]);
      expect(sentUnits().filter((u) => u.side === 'enemy')).toEqual([expect.objectContaining({ id: 'enemy-1', source: 'ally', detectedByDroneId: null })]);
      mission.dispose();
    });

    it('moves an allied unit on the move, and it reconnoitres the ground it reaches', async () => {
      const start = offsetLatLng(area.center, 0, -20_000);
      const mission = await online([force({ id: 'ally-1', side: 'ally', kind: 'infantry', position: start, intel: true, speedMs: 6, headingDeg: 90, waypoint: offsetLatLng(start, 6000, 0) })]);
      const recon = () => sent.filter((m) => m.type === 'recon_cells').flatMap((m) => (m as Extract<ServerMessage, { type: 'recon_cells' }>).cells);
      const before = recon().length;
      vi.advanceTimersByTime(60_000);
      // It went 3.6 km east in a minute: the ground at its new place is seen now, the ground far to the east too.
      const cells = recon();
      expect(cells.length).toBeGreaterThan(before);
      expect(cells.some(([x]) => x > 40)).toBe(true);
      const last = sentUnits().filter((u) => u.id === 'ally-1').at(-1)!;
      expect(toMetersFrom(start, last.position).east).toBeGreaterThan(3000);
      mission.dispose();
    });

    it('stops an enemy that leaves sight where it was last seen, with its course, and keeps it there', async () => {
      const allyAt = offsetLatLng(area.center, 0, -20_000);
      const mission = await online([
        force({ id: 'ally-1', side: 'ally', position: allyAt, intel: true }),
        // Moving east out of the ally's 800 m after about 9 ticks: at 60 m a tick it leaves the sight at 800 m.
        force({ id: 'enemy-1', kind: 'vehicle', position: offsetLatLng(allyAt, 300, 0), speedMs: 6, headingDeg: 90, waypoint: offsetLatLng(allyAt, 20_000, 0) }),
      ]);
      vi.advanceTimersByTime(60_000);
      const lastSeen = sentUnits().filter((u) => u.id === 'enemy-1').at(-1)!;
      expect(lastSeen.inSight).toBe(false);
      const snap = () => (mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>).units!.find((u) => u.id === 'enemy-1')!;
      expect(snap()).toEqual(lastSeen);
      // It keeps driving out there, but the dashboard is not told: its place on the map does not change.
      const reports = sentUnits().filter((u) => u.id === 'enemy-1').length;
      vi.advanceTimersByTime(60_000);
      expect(sentUnits().filter((u) => u.id === 'enemy-1')).toHaveLength(reports);
      expect(snap().position).toEqual(lastSeen.position);
      expect(snap().headingDeg).toBeCloseTo(90, 0);
      expect(toMetersFrom(allyAt, lastSeen.position).east).toBeLessThan(850);
      mission.dispose();
    });

    it('follows an enemy on the move while it is in sight, and keeps it where it was last seen after', async () => {
      const allyAt = offsetLatLng(area.center, 0, -20_000);
      const mission = await online([
        force({ id: 'ally-1', side: 'ally', position: allyAt, intel: true }),
        // 60 m a tick (6 m/s, 10 simulated seconds) east from 300 m: out of the ally's 800 m after about 9 ticks.
        force({ id: 'enemy-1', kind: 'vehicle', position: offsetLatLng(allyAt, 300, 0), speedMs: 6, headingDeg: 90, waypoint: offsetLatLng(allyAt, 20_000, 0) }),
      ]);
      vi.advanceTimersByTime(30_000);
      const seen = sentUnits().filter((u) => u.id === 'enemy-1');
      expect(seen.length).toBeGreaterThan(4);
      expect(seen.length).toBeLessThan(15);
      const last = seen.at(-1)!;
      expect(toMetersFrom(allyAt, last.position).east).toBeLessThan(850);
      expect(last.headingDeg).toBeCloseTo(90, 0);
      expect(last.speedMs).toBe(6);
      const snap = mission.snapshot();
      expect(snap.type === 'mission_snapshot' && snap.units?.find((u) => u.id === 'enemy-1')?.position).toEqual(last.position);
      mission.dispose();
    });
  });

  it('gives a snapshot of a running mission and an empty one when idle', () => {
    const mission = createMissionController((m) => sent.push(m));
    expect(mission.snapshot()).toEqual({ type: 'mission_snapshot', running: false, droneCount: 0, drones: [] });
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS + 2000);
    const snap = mission.snapshot();
    expect(snap.type === 'mission_snapshot' && snap.running).toBe(true);
    expect(snap.type === 'mission_snapshot' && snap.drones.map((d) => d.callsign)).toEqual(['BA-01', 'BA-02', 'BA-03']);
    mission.dispose();
  });

  it('flies a drone on a heading until it is given something else', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
    sent = [];
    mission.handle({ type: 'heading', droneIds: ['drone-1'], headingDeg: 0 });
    vi.advanceTimersByTime(3000);
    const moves = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1');
    expect(moves.length).toBeGreaterThanOrEqual(3);
    const last = moves[moves.length - 1];
    expect(last.type === 'position' && last.position.lat).toBeGreaterThan(50);
    expect(last.type === 'position' && last.heading).toBe(0);
    mission.dispose();
  });

  it('turns the nose into a crosswind so the drone still tracks the target', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'wind', speedMs: 3, fromDeg: 270 }); // wind blows east, pushing a northbound drone right
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
    sent = [];
    mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
    vi.advanceTimersByTime(2000);
    const last = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1').at(-1);
    expect(last && last.type === 'position' && last.crabDeg).toBeLessThan(-10);
    expect(last && last.type === 'position' && last.heading).toBeGreaterThan(330);
    mission.dispose();
  });

  it('flies a drone through its own control points in order', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
    vi.advanceTimersByTime(STAGGER_MS * 2 + BOOT_MS + CONNECT_MS);
    sent = [];
    mission.handle({
      type: 'route',
      droneId: 'drone-2',
      points: [{ lat: 50.0005, lng: 30 }, { lat: 50.001, lng: 30 }],
    });
    vi.advanceTimersByTime(20_000);
    const last = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-2').at(-1);
    expect(last && last.type === 'position' && last.position.lat).toBeCloseTo(50.001, 4);
    // Drone 1 has no route: it only climbs and keeps its launch point.
    const drone1 = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1').at(-1);
    if (drone1 && drone1.type === 'position') expect(drone1.position.lat).toBeCloseTo(50, 6);
    mission.dispose();
  });

  describe('task list', () => {
    const a = { lat: 50.0005, lng: 30 };
    const b = { lat: 50.001, lng: 30 };
    const c = { lat: 50.0015, lng: 30 };
    const start = { lat: 50, lng: 30 };
    // Last reported task list and flown path, and last reported position, of a drone.
    const tasksOf = (droneId: string) => {
      const last = sent.filter((m) => m.type === 'drone_tasks' && m.droneId === droneId).at(-1);
      return last?.type === 'drone_tasks' ? last : undefined;
    };
    const positionOf = (droneId: string) => {
      const last = sent.filter((m) => m.type === 'position' && m.droneId === droneId).at(-1);
      return last?.type === 'position' ? last.position : undefined;
    };
    const online = () => {
      const mission = createMissionController((m) => sent.push(m));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 3 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      sent = [];
      return mission;
    };

    it('reports the new tasks and the departure point at once', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      expect(tasksOf('drone-1')).toMatchObject({ trail: [start], tasks: [a] });
      mission.dispose();
    });

    it('appends a point to the tasks, and a plain move replaces them', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: b, append: true });
      expect(tasksOf('drone-1')?.tasks).toEqual([a, b]);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: c });
      expect(tasksOf('drone-1')?.tasks).toEqual([c]);
      mission.dispose();
    });

    it('flies the tasks in order and keeps the flown path once they are done', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: b, append: true });
      vi.advanceTimersByTime(1000);
      expect(tasksOf('drone-1')).toMatchObject({ trail: [start, a], tasks: [b] });
      vi.advanceTimersByTime(5000);
      expect(positionOf('drone-1')).toEqual(b);
      expect(tasksOf('drone-1')).toMatchObject({ trail: [start, a, b], tasks: [] });
      mission.dispose();
    });

    it('treats an append as a plain move when the drone has no tasks', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a, append: true });
      expect(tasksOf('drone-1')).toMatchObject({ trail: [start], tasks: [a] });
      mission.dispose();
    });

    it('keeps at most MAX_TASKS tasks', () => {
      const mission = online();
      for (let i = 0; i < MAX_TASKS + 2; i++) mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.01 + i * 0.0001, lng: 30 }, append: true });
      expect(tasksOf('drone-1')?.tasks).toHaveLength(MAX_TASKS);
      mission.dispose();
    });

    it('removes a later task, or the current one so the drone goes on to the next from where it is', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [a, b, c] });
      mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 1 });
      expect(tasksOf('drone-1')?.tasks).toEqual([a, c]);
      mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 0 });
      expect(tasksOf('drone-1')).toMatchObject({ trail: [start], tasks: [c] });
      const before = sent.length;
      mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 5 });
      mission.handle({ type: 'remove_task', droneId: 'drone-9', index: 0 });
      expect(sent.length).toBe(before);
      mission.dispose();
    });

    it('hold drops all tasks and the drone stays where it is', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [{ lat: 50.02, lng: 30 }, b] });
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'hold', droneIds: ['drone-1'] });
      expect(tasksOf('drone-1')).toMatchObject({ trail: [], tasks: [] });
      const held = positionOf('drone-1') as LatLng;
      vi.advanceTimersByTime(3000);
      expect(positionOf('drone-1')).toEqual(held);
      mission.dispose();
    });

    it('sends the task list only when it changes, not with every position', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
      const before = sent.filter((m) => m.type === 'drone_tasks').length;
      vi.advanceTimersByTime(3000); // flying, no point reached yet
      expect(sent.filter((m) => m.type === 'drone_tasks').length).toBe(before);
      const position = sent.find((m) => m.type === 'position');
      expect(position && 'tasks' in position).toBe(false);
      mission.dispose();
    });

    it('includes the tasks in the snapshot', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [{ lat: 50.02, lng: 30 }, b] });
      const snap = mission.snapshot();
      const drone = snap.type === 'mission_snapshot' ? snap.drones.find((d) => d.droneId === 'drone-1') : undefined;
      expect(drone).toMatchObject({ trail: [start], tasks: [{ lat: 50.02, lng: 30 }, b] });
      mission.dispose();
    });

    it('starts a new flown path when the tasks are replaced', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      expect(tasksOf('drone-1')?.trail).toEqual([positionOf('drone-1')]);
      mission.dispose();
    });

    it('moves a later task, or the current one so the drone turns toward it from where it is', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [{ lat: 50.02, lng: 30 }, b] });
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 1, point: c });
      expect(tasksOf('drone-1')?.tasks).toEqual([{ lat: 50.02, lng: 30 }, c]);
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 0, point: a });
      expect(tasksOf('drone-1')?.tasks).toEqual([a, c]);
      expect(tasksOf('drone-1')?.trail).toEqual([start, positionOf('drone-1')]);
      const before = sent.length;
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 4, point: a });
      mission.handle({ type: 'update_task', droneId: 'drone-9', index: 0, point: a });
      expect(sent.length).toBe(before);
      mission.dispose();
    });
  });

  describe('engagement', () => {
    const force = (over: Partial<ForceUnit>): ForceUnit => ({
      id: 'enemy-1', side: 'enemy', kind: 'vehicle', position: area.center, headingDeg: null, speedMs: 0, intel: true, band: [0, 100_000], waypoint: null, ...over,
    });
    const statuses = () => sent.filter((m) => m.type === 'drone_status').map((m) => (m.type === 'drone_status' ? m.status : ''));
    const drone1 = () => sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1') as Extract<ServerMessage, { type: 'position' }>[];
    // Lets the pending promises run (the units are placed once the water is known).
    async function online(forces: ForceUnit[], random: () => number = () => 0.99) {
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => forces.map((f) => ({ ...f })), undefined, random);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      sent = [];
      return mission;
    }

    it('refuses a unit nobody has seen yet, and an ally', async () => {
      const mission = await online([force({ intel: false, position: offsetLatLng(area.center, 500, 0) }), force({ id: 'ally-1', side: 'ally', kind: 'infantry', position: offsetLatLng(area.center, -20_000, 0), intel: true })]);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'ally-1', mode: 'strike' });
      vi.advanceTimersByTime(3000);
      expect(statuses()).not.toContain('engaging');
      mission.dispose();
    });

    it('a pursuit starts only within the camera range; a strike may start from further away', async () => {
      const mission = await online([force({ position: offsetLatLng(area.center, 2000, 0) })]);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'pursuit' });
      vi.advanceTimersByTime(1000);
      expect(statuses()).not.toContain('engaging');
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      vi.advanceTimersByTime(1000);
      expect(statuses()).toEqual(['engaging']);
      mission.dispose();
    });

    it('a strike on a vehicle that is destroyed takes the unit off the map, and the drone is spent', async () => {
      const mission = await online([force({ position: offsetLatLng(area.center, 1000, 0) })], () => 0.1);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      vi.advanceTimersByTime(30_000);
      expect(statuses()).toEqual(['engaging', 'destroyed']);
      expect(sent.filter((m) => m.type === 'drone_status').at(-1)).toEqual({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed', cause: 'collision' });
      expect(sent).toContainEqual({ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'destroyed' });
      const snap = mission.snapshot();
      expect(snap.type === 'mission_snapshot' && snap.units?.map((u) => u.id)).toEqual([]);
      mission.dispose();
    });

    it('a pursuit keeps 200–400 m from a standing unit, and circles it', async () => {
      const enemy = offsetLatLng(area.center, 500, 0);
      const mission = await online([force({ position: enemy })]);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'pursuit' });
      vi.advanceTimersByTime(30_000); // catches up with the post first
      sent = [];
      vi.advanceTimersByTime(120_000);
      const distances = drone1().map((p) => distanceM(enemy, p.position));
      const bearings = drone1().map((p) => bearingTo(enemy, p.position));
      expect(statuses()).not.toContain('destroyed');
      expect(distances.length).toBeGreaterThan(100);
      expect(Math.min(...distances)).toBeGreaterThan(190);
      expect(Math.max(...distances)).toBeLessThan(410);
      // Around the unit, not just on one side: the bearings cover the four quarters.
      expect(new Set(bearings.map((b) => Math.floor(b / 90))).size).toBe(4);
      mission.dispose();
    });

    it('a pursuit settles behind a moving unit and follows it', async () => {
      const mission = await online([force({ kind: 'vehicle', position: offsetLatLng(area.center, 200, 0), headingDeg: 0, speedMs: 6, waypoint: offsetLatLng(area.center, 200, 20_000) })]);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'pursuit' });
      vi.advanceTimersByTime(90_000);
      const snap = mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>;
      const unit = snap.units!.find((u) => u.id === 'enemy-1')!;
      const drone = snap.drones[0];
      expect(drone.status).toBe('engaging');
      const d = distanceM(unit.position, drone.position!);
      expect(d).toBeGreaterThan(190);
      expect(d).toBeLessThan(410);
      // Its course is north: the drone is south of it, behind.
      expect(Math.abs(bearingTo(unit.position, drone.position!) - 180)).toBeLessThan(30);
      mission.dispose();
    });

    it('a move order ends the engagement: the drone flies its new tasks', async () => {
      const mission = await online([force({ position: offsetLatLng(area.center, 1000, 0) })]);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: offsetLatLng(area.center, 0, -3000) });
      vi.advanceTimersByTime(1000);
      expect(statuses()).toEqual(['engaging', 'moving']);
      mission.dispose();
    });
  });

  describe('occupied buildings', () => {
    // Houses 150–250 m east of the start.
    // One house object, as the tiles hand out the same building each time.
    const house = { rings: [], heightM: 40, south: 0, north: 0, west: 0, east: 0 } as Building;
    const houses: Buildings = {
      at: (p) => {
        const { east } = toMetersFrom(area.center, p);
        return east > 150 && east < 250 ? house : null;
      },
    };
    const force = (over: Partial<ForceUnit>): ForceUnit => ({ id: 'enemy-1', side: 'enemy', kind: 'infantry', position: area.center, headingDeg: null, speedMs: 0, intel: true, band: [0, 100_000], waypoint: null, ...over });
    const newEnemies = () => sent.filter((m) => m.type === 'units').flatMap((m) => (m as Extract<ServerMessage, { type: 'units' }>).units).filter((u) => u.id !== 'enemy-1' && u.side === 'enemy');

    it('an enemy infantry walking into a building makes it an enemy position, once', async () => {
      const forces = [
        force({ position: offsetLatLng(area.center, 145, 0), speedMs: 1.5, waypoint: offsetLatLng(area.center, 400, 0) }),
        force({ id: 'ally-1', side: 'ally', kind: 'infantry', position: area.center, intel: true }),
      ];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, houses, () => forces.map((f) => ({ ...f })));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      await Promise.resolve();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(60_000);
      // The ally watches 800 m around it, so the new position is seen at once.
      expect(newEnemies()).toEqual([expect.objectContaining({ id: 'enemy-2', kind: 'position', source: 'ally' })]);
      mission.dispose();
    });

    it('allied infantry walking into a building makes it an allied position, known at once', async () => {
      const forces = [force({ id: 'ally-1', side: 'ally', position: offsetLatLng(area.center, 145, 0), speedMs: 1.5, waypoint: offsetLatLng(area.center, 400, 0) })];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, houses, () => forces.map((f) => ({ ...f })));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(60_000);
      const snap = mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>;
      expect(snap.units?.find((u) => u.id === 'ally-2')).toEqual(expect.objectContaining({ side: 'ally', kind: 'position', inSight: true }));
      expect(newEnemies()).toEqual([]);
      mission.dispose();
    });

    it('a vehicle does not enter the houses, so no building is taken', async () => {
      const forces = [force({ kind: 'vehicle', position: offsetLatLng(area.center, 100, 0), speedMs: 6, headingDeg: 90, waypoint: offsetLatLng(area.center, 400, 0) })];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, houses, () => forces.map((f) => ({ ...f })));
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(20_000);
      expect(newEnemies()).toEqual([]);
      mission.dispose();
    });
  });

  describe('strike results', () => {
    const force = (over: Partial<ForceUnit>): ForceUnit => ({
      id: 'enemy-1', side: 'enemy', kind: 'vehicle', position: area.center, headingDeg: null, speedMs: 0, intel: true, band: [0, 100_000], waypoint: null, ...over,
    });
    const hits = () => sent.filter((m) => m.type === 'unit_hit');
    const lastDroneStatus = () => sent.filter((m) => m.type === 'drone_status').at(-1);
    async function strike(kind: ForceUnit['kind'], random: () => number) {
      const forces = [force({ kind, position: offsetLatLng(area.center, 1000, 0) })];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => forces.map((f) => ({ ...f })), undefined, random);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      sent = [];
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      vi.advanceTimersByTime(30_000);
      return mission;
    }
    const enemyInSnapshot = (mission: ReturnType<typeof createMissionController>) => {
      const snap = mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>;
      return snap.units?.find((u) => u.id === 'enemy-1');
    };

    it('a damaged vehicle stays on the map, marked damaged; the drone is spent in the strike', async () => {
      const mission = await strike('vehicle', () => 0.45);
      expect(hits()).toEqual([{ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'damaged' }]);
      expect(enemyInSnapshot(mission)).toEqual(expect.objectContaining({ id: 'enemy-1', damaged: true }));
      expect(lastDroneStatus()).toEqual({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed', cause: 'collision' });
      mission.dispose();
    });

    it('a vehicle the strike does not hurt stays whole, and the drone is still spent', async () => {
      const mission = await strike('vehicle', () => 0.95);
      expect(hits()).toEqual([{ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'unharmed' }]);
      expect(enemyInSnapshot(mission)).toEqual(expect.not.objectContaining({ damaged: true }));
      expect(lastDroneStatus()).toEqual(expect.objectContaining({ status: 'destroyed', cause: 'collision' }));
      mission.dispose();
    });

    it('infantry shoots the drone down first: no hit on the unit, the drone is destroyed as shot down', async () => {
      const mission = await strike('infantry', () => 0.1);
      expect(hits()).toEqual([]);
      expect(enemyInSnapshot(mission)).toBeDefined();
      expect(lastDroneStatus()).toEqual({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed', cause: 'shot_down' });
      mission.dispose();
    });

    it('infantry that does not shoot the drone down can be destroyed', async () => {
      const mission = await strike('infantry', () => 0.25);
      expect(hits()).toEqual([{ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'destroyed' }]);
      expect(enemyInSnapshot(mission)).toBeUndefined();
      mission.dispose();
    });
  });

  describe('mission odds', () => {
    const force = (over: Partial<ForceUnit>): ForceUnit => ({
      id: 'enemy-1', side: 'enemy', kind: 'vehicle', position: area.center, headingDeg: null, speedMs: 0, intel: true, band: [0, 100_000], waypoint: null, ...over,
    });
    async function strikeWith(random: () => number, odds?: MissionOdds) {
      const forces = [force({ position: offsetLatLng(area.center, 1000, 0) })];
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => forces.map((f) => ({ ...f })), undefined, random);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1, ...(odds ? { odds } : {}) });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      mission.handle({ type: 'engage', droneId: 'drone-1', targetId: 'enemy-1', mode: 'strike' });
      vi.advanceTimersByTime(30_000);
      return mission;
    }

    it('a mission plays with the odds the operator started it with', async () => {
      const allDestroyed: MissionOdds = { ...DEFAULT_ODDS, vehicle: { destroyed: 1, damaged: 0 } };
      const mission = await strikeWith(() => 0.99, allDestroyed);
      expect(sent).toContainEqual({ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'destroyed' });
      mission.dispose();
    });

    it('without odds of its own, a mission uses the defaults', async () => {
      const mission = await strikeWith(() => 0.99);
      expect(sent).toContainEqual({ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'unharmed' });
      mission.dispose();
    });
  });

  describe('mission composition', () => {
    it('passes the composition to the placement, and refuses a start whose placed unit breaks the rules', async () => {
      const seen: unknown[] = [];
      const composition = { enemy: { vehicle: 2 }, placed: [{ side: 'enemy' as const, kind: 'vehicle' as const, position: offsetLatLng(area.center, 0, -15000 + 6000) }] };
      const mission = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, (_a, _s, _w, _o, c) => {
        seen.push(c);
        return [];
      });
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1, composition });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(seen).toEqual([composition]);
      mission.dispose();

      // A placed unit that the rules refuse: the start is refused, and nothing runs.
      sent = [];
      const refused = createMissionController((m) => sent.push(m), undefined, NO_TERRAIN, undefined, () => {
        throw new PlacementError({ side: 'enemy', kind: 'vehicle', position: area.center });
      });
      refused.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(sent).toEqual([{ type: 'mission_error', reason: 'bad_placement' }]);
      refused.dispose();
    });
  });

  describe('mission clock', () => {
    const clocks = () => sent.filter((m) => m.type === 'clock') as Extract<ServerMessage, { type: 'clock' }>[];
    const positionsOf = (droneId: string) => sent.filter((m) => m.type === 'position' && m.droneId === droneId) as Extract<ServerMessage, { type: 'position' }>[];
    const droneAt = (mission: ReturnType<typeof createAtSpeed>) => (mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>).drones[0].position!;
    // The clock at its default speed (×1): the clock tests set the speed and the pause themselves.
    const atRealSpeed = (...args: Parameters<typeof createAtSpeed> extends [...infer P] ? P : never) => createAtSpeed(...args);

    // A started mission with its drone online and flying east; the clock is already running (boot took real time).
    function startAndMove(speed?: number) {
      const mission = atRealSpeed((m) => sent.push(m), undefined, NO_TERRAIN);
      if (speed) mission.handle({ type: 'set_clock', speed: speed as 10 });
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1 });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50, lng: 30.5 } });
      sent = [];
      return mission;
    }

    it('runs at real speed by default: a drone flies 10 m in one real second at 10 m/s', () => {
      const mission = startAndMove();
      const before = droneAt(mission);
      vi.advanceTimersByTime(1000);
      expect(distanceM(before, droneAt(mission))).toBeCloseTo(10, 0);
      expect(clocks().at(-1)!.speed).toBe(1);
      mission.dispose();
    });

    it('a pause stops the simulation and the clock, and the flight goes on from where it stopped', () => {
      const mission = startAndMove(5);
      vi.advanceTimersByTime(1000);
      const stoppedAt = droneAt(mission);
      const clockBefore = clocks().at(-1)!.simulatedS;
      mission.handle({ type: 'set_clock', paused: true });
      vi.advanceTimersByTime(5000);
      expect(droneAt(mission)).toEqual(stoppedAt);
      expect(clocks().at(-1)).toMatchObject({ paused: true });
      expect(clocks().at(-1)!.simulatedS).toBeCloseTo(clockBefore, 5);
      mission.handle({ type: 'set_clock', paused: false });
      vi.advanceTimersByTime(1000);
      expect(distanceM(stoppedAt, droneAt(mission))).toBeGreaterThan(0);
      mission.dispose();
    });

    it('a speed-up sends the new speed at once, and one position per drone per tick, not one per simulated step', () => {
      const mission = startAndMove();
      mission.handle({ type: 'set_clock', speed: 10 });
      expect(clocks().at(-1)).toMatchObject({ speed: 10 });
      const clockBefore = clocks().at(-1)!.simulatedS;
      sent = [];
      vi.advanceTimersByTime(1000);
      // Ten simulated seconds in one real second: the drone took ten steps, but reports its position once.
      expect(positionsOf('drone-1')).toHaveLength(1);
      expect(clocks().at(-1)!.simulatedS - clockBefore).toBeCloseTo(10, 5);
      mission.dispose();
    });
  });

  describe('automatic units', () => {
    it('a start with no hand placements generates the enemy and the allies by their default counts', async () => {
      const mission = createAtSpeed((m) => sent.push(m), undefined, NO_TERRAIN);
      mission.handle({ type: 'mission_start', area, layout: single, droneCount: 1, composition: { enemy: DEFAULT_ENEMY_COUNTS, ally: DEFAULT_ALLY_COUNTS, placed: [] } });
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const snap = mission.snapshot() as Extract<ServerMessage, { type: 'mission_snapshot' }>;
      const all = snap.units ?? [];
      // The allies are known at once, so the snapshot shows every one of them placed by default.
      expect(all.filter((u) => u.side === 'ally').length).toBe(Object.values(DEFAULT_ALLY_COUNTS).reduce((a, b) => a + b, 0));
      expect(sent.some((m) => m.type === 'units')).toBe(true);
      mission.dispose();
    });
  });
});
