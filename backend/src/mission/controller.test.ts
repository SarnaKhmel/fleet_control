import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLng, ServerMessage } from '../../../shared/protocol.js';
import { createMissionController } from './controller.js';
import { CONNECT_MS, BOOT_MS, STAGGER_MS } from './schedule.js';

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
    mission.handle({ type: 'mission_start', area, layout: single });

    vi.advanceTimersByTime(STAGGER_MS + BOOT_MS + CONNECT_MS);

    const online = sent.filter((m) => m.type === 'drone_online');
    expect(online.map((m) => (m.type === 'drone_online' ? m.telemetry.meta.callsign : ''))).toEqual(['BA-01', 'BA-02']);
    expect(sent.some((m) => m.type === 'drone_boot' && m.droneId === 'drone-2' && m.status === 'booting')).toBe(true);
    mission.dispose();
  });

  it('refuses a second start while a mission runs', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
    mission.handle({ type: 'mission_start', area, layout: single });
    expect(sent).toContainEqual({ type: 'mission_error', reason: 'already_running' });
    mission.dispose();
  });

  it('reports a start outside the mission area and does not run it', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: { kind: 'single', point: { lat: 52, lng: 30 } } });
    expect(sent).toEqual([{ type: 'mission_error', reason: 'outside_area' }]);
    mission.dispose();
  });

  it('reset stops pending timers and announces the reset', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
    mission.handle({ type: 'mission_reset' });
    sent = [];
    vi.advanceTimersByTime(60_000);
    expect(sent).toEqual([]);
    mission.dispose();
  });

  it('allows a new mission after reset', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
    mission.handle({ type: 'mission_reset' });
    mission.handle({ type: 'mission_start', area, layout: single });
    expect(sent.some((m) => m.type === 'mission_error')).toBe(false);
    mission.dispose();
  });

  it('brings all three drones online within four seconds', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
    vi.advanceTimersByTime(4000);
    expect(sent.filter((m) => m.type === 'drone_online')).toHaveLength(3);
    mission.dispose();
  });

  it('moves an online drone toward a target and reports positions', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
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
    mission.handle({ type: 'mission_start', area, layout: single });
    mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.02, lng: 30 } });
    // Once online, the drone only climbs: the move it got while booting was not kept.
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS + 3000);
    const last = sent.filter((m) => m.type === 'position' && m.droneId === 'drone-1').at(-1);
    expect(last && last.type === 'position' && last.position).toEqual(single.point);
    expect(last && last.type === 'position' && last.tasks).toEqual([]);
    mission.dispose();
  });

  it('climbs an online drone to hover altitude before it is given a move', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
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

  it('gives a snapshot of a running mission and an empty one when idle', () => {
    const mission = createMissionController((m) => sent.push(m));
    expect(mission.snapshot()).toEqual({ type: 'mission_snapshot', running: false, drones: [] });
    mission.handle({ type: 'mission_start', area, layout: single });
    vi.advanceTimersByTime(BOOT_MS + CONNECT_MS + 2000);
    const snap = mission.snapshot();
    expect(snap.type === 'mission_snapshot' && snap.running).toBe(true);
    expect(snap.type === 'mission_snapshot' && snap.drones.map((d) => d.callsign)).toEqual(['BA-01', 'BA-02', 'BA-03']);
    mission.dispose();
  });

  it('flies a drone on a heading until it is given something else', () => {
    const mission = createMissionController((m) => sent.push(m));
    mission.handle({ type: 'mission_start', area, layout: single });
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
    mission.handle({ type: 'mission_start', area, layout: single });
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
    mission.handle({ type: 'mission_start', area, layout: single });
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
    const lastOf = (droneId: string) => {
      const last = sent.filter((m) => m.type === 'position' && m.droneId === droneId).at(-1);
      return last?.type === 'position' ? last : undefined;
    };
    const online = () => {
      const mission = createMissionController((m) => sent.push(m));
      mission.handle({ type: 'mission_start', area, layout: single });
      vi.advanceTimersByTime(BOOT_MS + CONNECT_MS);
      sent = [];
      return mission;
    };

    it('reports the new tasks and the departure point at once', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      expect(lastOf('drone-1')).toMatchObject({ trail: [start], tasks: [a] });
      mission.dispose();
    });

    it('appends a point to the tasks, and a plain move replaces them', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: b, append: true });
      expect(lastOf('drone-1')?.tasks).toEqual([a, b]);
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: c });
      expect(lastOf('drone-1')?.tasks).toEqual([c]);
      mission.dispose();
    });

    it('flies the tasks in order and keeps the flown path once they are done', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a });
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: b, append: true });
      vi.advanceTimersByTime(1000);
      expect(lastOf('drone-1')).toMatchObject({ trail: [start, a], tasks: [b] });
      vi.advanceTimersByTime(5000);
      expect(lastOf('drone-1')).toMatchObject({ position: b, trail: [start, a, b], tasks: [] });
      mission.dispose();
    });

    it('treats an append as a plain move when the drone has no tasks', () => {
      const mission = online();
      mission.handle({ type: 'move', droneIds: ['drone-1'], target: a, append: true });
      expect(lastOf('drone-1')).toMatchObject({ trail: [start], tasks: [a] });
      mission.dispose();
    });

    it('keeps at most ten tasks', () => {
      const mission = online();
      for (let i = 0; i < 12; i++) mission.handle({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.01 + i * 0.001, lng: 30 }, append: true });
      expect(lastOf('drone-1')?.tasks).toHaveLength(10);
      mission.dispose();
    });

    it('removes a later task, or the current one so the drone goes on to the next from where it is', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [a, b, c] });
      mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 1 });
      expect(lastOf('drone-1')?.tasks).toEqual([a, c]);
      mission.handle({ type: 'remove_task', droneId: 'drone-1', index: 0 });
      expect(lastOf('drone-1')).toMatchObject({ trail: [start], tasks: [c] });
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
      const held = lastOf('drone-1')!;
      expect(held).toMatchObject({ trail: [], tasks: [] });
      vi.advanceTimersByTime(3000);
      expect(lastOf('drone-1')!.position as LatLng).toEqual(held.position);
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
      const now = lastOf('drone-1')!;
      expect(now.trail).toEqual([now.position]);
      mission.dispose();
    });

    it('moves a later task, or the current one so the drone turns toward it from where it is', () => {
      const mission = online();
      mission.handle({ type: 'route', droneId: 'drone-1', points: [{ lat: 50.02, lng: 30 }, b] });
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 1, point: c });
      expect(lastOf('drone-1')?.tasks).toEqual([{ lat: 50.02, lng: 30 }, c]);
      vi.advanceTimersByTime(2000);
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 0, point: a });
      const turned = lastOf('drone-1')!;
      expect(turned.tasks).toEqual([a, c]);
      expect(turned.trail).toEqual([start, turned.position]);
      const before = sent.length;
      mission.handle({ type: 'update_task', droneId: 'drone-1', index: 4, point: a });
      mission.handle({ type: 'update_task', droneId: 'drone-9', index: 0, point: a });
      expect(sent.length).toBe(before);
      mission.dispose();
    });
  });
});
