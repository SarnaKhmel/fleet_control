import { describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { courseDeg, droneElement, readoutText, syncDroneMarkers } from './droneMarkers';
import type { DroneView } from './missionStore';
import { useSelectionStore } from './selection';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

const online: DroneView = { callsign: 'BA-01', status: 'idle', cause: null, warning: null, progress: 100, position: { lat: 50, lng: 30 }, heading: 45, altitudeM: 150, groundM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] };
const booting: DroneView = { callsign: 'drone-2', status: 'booting', cause: null, warning: null, progress: 40, position: null, heading: null, altitudeM: null, groundM: null, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] };

describe('drone markers', () => {
  it('draws NATO drones as symbols', () => {
    expect(droneElement(online, 'nato').querySelector('svg')).toBeTruthy();
  });

  it('draws own-style drones with a status class', () => {
    expect(droneElement(online, 'custom').classList.contains('is-idle')).toBe(true);
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

  it('pulses a drone with a building ahead, and rebuilds the marker when the warning comes and goes', () => {
    expect(classes({ ...online, warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } }, 'custom')).toContain('is-warning');
    expect(classes({ ...online, warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } }, 'nato')).toContain('is-warning');
    const map = new FakeMap({ style: 'x' });
    const [calm] = syncDroneMarkers(map as never, { 'drone-1': online }, 'custom');
    const [warned] = syncDroneMarkers(map as never, { 'drone-1': { ...online, warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } } }, 'custom');
    expect(warned).not.toBe(calm);
    const [again] = syncDroneMarkers(map as never, { 'drone-1': { ...online, warning: { ...{ kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 }, etaS: 11 } } }, 'custom');
    expect(again).toBe(warned);
  });
});

describe('drone arrows and readout', () => {
  const arrow = (el: HTMLElement, which: 'course' | 'nose') => el.querySelector<HTMLElement>(`.drone-vector.is-${which}`)?.style.transform;
  const crabbing = { ...online, status: 'moving' as const, heading: 100, crabDeg: 10, speedMs: 9.4 };

  it('the course is the nose turned back by the crab angle, within 0–360°', () => {
    expect(courseDeg(crabbing)).toBe(90);
    expect(courseDeg({ ...online, heading: 5, crabDeg: 10 })).toBe(355);
    expect(courseDeg({ ...online, heading: 355, crabDeg: -10 })).toBe(5);
    expect(courseDeg({ ...online, heading: null, crabDeg: 0 })).toBe(0);
  });

  it('draws two arrows, course and nose, in both symbol styles', () => {
    for (const style of ['custom', 'nato'] as const) {
      const el = droneElement(crabbing, style);
      expect(arrow(el, 'course')).toBe('rotate(90deg)');
      expect(arrow(el, 'nose')).toBe('rotate(100deg)');
    }
  });

  it('has no arrows while the drone is on the ground, landing or down', () => {
    for (const status of ['landed', 'landing', 'lost_link', 'destroyed'] as const) {
      expect(droneElement({ ...online, status }, 'custom').querySelector('.drone-vector')).toBeNull();
      expect(droneElement({ ...online, status }, 'nato').querySelector('.drone-vector')).toBeNull();
    }
  });

  it('turns the arrows on a position update without rebuilding the marker', () => {
    const map = new FakeMap({ style: 'x' });
    const [first] = syncDroneMarkers(map as never, { 'drone-1': crabbing }, 'custom');
    const [second] = syncDroneMarkers(map as never, { 'drone-1': { ...crabbing, heading: 190 } }, 'custom');
    expect(second).toBe(first);
    expect(arrow((second as unknown as { element: HTMLElement }).element, 'course')).toBe('rotate(180deg)');
    expect(arrow((second as unknown as { element: HTMLElement }).element, 'nose')).toBe('rotate(190deg)');
  });

  it('shows height above ground and speed beside a selected drone only', () => {
    const flying = { ...crabbing, altitudeM: 260, groundM: 200 };
    expect(readoutText(flying)).toBe('60 m · 9.4 m/s');
    expect(droneElement(flying, 'custom').querySelector('.drone-readout')).toBeNull();
    expect(droneElement(flying, 'custom', true).querySelector('.drone-readout')?.textContent).toBe('60 m · 9.4 m/s');
    expect(droneElement({ ...flying, status: 'destroyed' }, 'nato', true).querySelector('.drone-readout')).toBeNull();
  });

  it('falls back to the set height before the altitude is known, and refreshes the readout each update', () => {
    expect(readoutText({ ...crabbing, altitudeM: null, groundM: null })).toBe('60 m · 9.4 m/s');
    const map = new FakeMap({ style: 'x' });
    useSelectionStore.getState().select(['drone-1']);
    const flying = { ...crabbing, altitudeM: 260, groundM: 200 };
    const [marker] = syncDroneMarkers(map as never, { 'drone-1': flying }, 'custom');
    const el = (marker as unknown as { element: HTMLElement }).element;
    syncDroneMarkers(map as never, { 'drone-1': { ...flying, speedMs: 12 } }, 'custom');
    expect(el.querySelector('.drone-readout')?.textContent).toBe('60 m · 12.0 m/s');
    useSelectionStore.getState().select([]);
  });
});
