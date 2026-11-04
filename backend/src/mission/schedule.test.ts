import { describe, expect, it } from 'vitest';
import { buildSchedule, BOOT_MS, CONNECT_MS, droneStateAt, resolveStarts, STAGGER_MS } from './schedule';

const area = { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 };

describe('resolveStarts', () => {
  it('puts all drones on one point for a single layout', () => {
    const r = resolveStarts(area, { kind: 'single', point: { lat: 50, lng: 30 } });
    expect(r.ok && r.points).toHaveLength(3);
  });

  it('places clustered drones close to each other but not on one spot', () => {
    const r = resolveStarts(area, { kind: 'cluster', center: { lat: 50, lng: 30 }, radiusM: 2000 });
    if (!r.ok) throw new Error('expected ok');
    expect(new Set(r.points.map((p) => `${p.lat},${p.lng}`)).size).toBe(3);
  });

  it('rejects a start point outside the mission area', () => {
    const r = resolveStarts(area, { kind: 'separate', points: [{ lat: 50, lng: 30 }, { lat: 50, lng: 30 }, { lat: 52, lng: 30 }] });
    expect(r).toEqual({ ok: false, reason: 'outside_area' });
  });
});

describe('buildSchedule and droneStateAt', () => {
  const schedule = buildSchedule([{ lat: 50, lng: 30 }, { lat: 50, lng: 30 }, { lat: 50, lng: 30 }]);

  it('staggers the drones by STAGGER_MS', () => {
    expect(schedule.map((d) => d.startAtMs)).toEqual([0, STAGGER_MS, 2 * STAGGER_MS]);
    expect(schedule.map((d) => d.callsign)).toEqual(['BA-01', 'BA-02', 'BA-03']);
  });

  it('walks a drone through offline, booting, connecting and idle', () => {
    const d = schedule[1];
    expect(droneStateAt(d, 0).status).toBe('offline');
    expect(droneStateAt(d, STAGGER_MS + BOOT_MS / 2)).toEqual({ status: 'booting', progress: 50 });
    expect(droneStateAt(d, STAGGER_MS + BOOT_MS + 1).status).toBe('connecting');
    expect(droneStateAt(d, STAGGER_MS + BOOT_MS + CONNECT_MS)).toEqual({ status: 'idle', progress: 100 });
  });
});
