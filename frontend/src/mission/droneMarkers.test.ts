import { describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { droneElement, syncDroneMarkers } from './droneMarkers';
import type { DroneView } from './missionStore';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

const online: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 45, altitudeM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, trail: [], tasks: [] };
const booting: DroneView = { callsign: 'drone-2', status: 'booting', progress: 40, position: null, heading: null, altitudeM: null, speedMs: 0, batteryPct: 100, crabDeg: 0, trail: [], tasks: [] };

describe('drone markers', () => {
  it('draws NATO drones as symbols', () => {
    expect(droneElement(online, 'nato').querySelector('svg')).toBeTruthy();
  });

  it('draws own-style drones with a rotated heading arrow and a status class', () => {
    const el = droneElement(online, 'custom');
    expect(el.classList.contains('is-idle')).toBe(true);
    expect(el.querySelector<HTMLElement>('.drone-marker-arrow')?.style.transform).toBe('rotate(45deg)');
  });

  it('shows one marker per drone that has a position', () => {
    const map = new FakeMap({ style: 'x' });
    const markers = syncDroneMarkers(map as never, { 'drone-1': online, 'drone-2': booting }, 'custom');
    expect(markers).toHaveLength(1);
    expect(markerInstances.some((m) => m.added)).toBe(true);
  });
});

describe('drone marker reuse', () => {
  it('moves the existing marker on a position update instead of recreating it', () => {
    const map = new FakeMap({ style: 'x' });
    const first = syncDroneMarkers(map as never, { 'drone-1': online }, 'custom');
    const moved = { ...online, position: { lat: 50.01, lng: 30.01 } };
    const second = syncDroneMarkers(map as never, { 'drone-1': moved }, 'custom');
    expect(second[0]).toBe(first[0]);
    expect((second[0] as unknown as { lngLat: number[] }).lngLat).toEqual([30.01, 50.01]);
  });
});

describe('drone marker state colors', () => {
  const classes = (drone: DroneView, style: 'custom' | 'nato') => [...droneElement(drone, style).classList];

  it('turns yellow at 30 % battery and red at 10 %', () => {
    expect(classes({ ...online, batteryPct: 31 }, 'custom')).not.toContain('is-battery-low');
    expect(classes({ ...online, batteryPct: 30 }, 'custom')).toContain('is-battery-low');
    expect(classes({ ...online, batteryPct: 10 }, 'custom')).toContain('is-battery-critical');
    expect(classes({ ...online, batteryPct: 10 }, 'nato')).toContain('is-battery-critical');
  });

  it('shows a drone that lost its link as lost, not by its battery', () => {
    const lost = { ...online, status: 'lost_link' as const, batteryPct: 0 };
    expect(classes(lost, 'custom')).toEqual(expect.arrayContaining(['is-lost_link']));
    expect(classes(lost, 'custom')).not.toContain('is-battery-critical');
    expect(classes(lost, 'nato')).toContain('is-lost_link');
  });

  it('rebuilds the marker when the battery crosses a level, and keeps it within a level', () => {
    const map = new FakeMap({ style: 'x' });
    const [first] = syncDroneMarkers(map as never, { 'drone-1': { ...online, batteryPct: 50 } }, 'custom');
    const [same] = syncDroneMarkers(map as never, { 'drone-1': { ...online, batteryPct: 40 } }, 'custom');
    expect(same).toBe(first);
    const [low] = syncDroneMarkers(map as never, { 'drone-1': { ...online, batteryPct: 29 } }, 'custom');
    expect(low).not.toBe(first);
    expect((low as unknown as { element: HTMLElement }).element.classList.contains('is-battery-low')).toBe(true);
  });

  it('marks landed and destroyed drones by their status', () => {
    expect(classes({ ...online, status: 'landed' }, 'custom')).toContain('is-landed');
    const destroyed = { ...online, status: 'destroyed' as const, batteryPct: 0 };
    expect(classes(destroyed, 'custom')).toContain('is-destroyed');
    expect(classes(destroyed, 'custom')).not.toContain('is-battery-critical');
    expect(classes(destroyed, 'nato')).toContain('is-destroyed');
  });
});
