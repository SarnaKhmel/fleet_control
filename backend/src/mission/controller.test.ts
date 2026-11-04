import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../../shared/protocol.js';
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
    vi.advanceTimersByTime(3000);
    expect(sent.some((m) => m.type === 'position')).toBe(false);
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
    expect(drone1 && drone1.type === 'position' && drone1.position.lat).toBeCloseTo(50, 6);
    mission.dispose();
  });
});
