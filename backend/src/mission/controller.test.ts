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
});
