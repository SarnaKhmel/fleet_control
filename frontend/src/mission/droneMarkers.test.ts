import { describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import { droneElement, syncDroneMarkers } from './droneMarkers';
import type { DroneView } from './missionStore';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

const online: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 45, altitudeM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, origin: null, tasks: [] };
const booting: DroneView = { callsign: 'drone-2', status: 'booting', progress: 40, position: null, heading: null, altitudeM: null, speedMs: 0, batteryPct: 100, crabDeg: 0, origin: null, tasks: [] };

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
    const markers = syncDroneMarkers(map as never, [], { 'drone-1': online, 'drone-2': booting }, 'custom');
    expect(markers).toHaveLength(1);
    expect(markerInstances.some((m) => m.added)).toBe(true);
  });
});

describe('drone marker reuse', () => {
  it('moves the existing marker on a position update instead of recreating it', () => {
    const map = new FakeMap({ style: 'x' });
    const first = syncDroneMarkers(map as never, [], { 'drone-1': online }, 'custom');
    const moved = { ...online, position: { lat: 50.01, lng: 30.01 } };
    const second = syncDroneMarkers(map as never, first, { 'drone-1': moved }, 'custom');
    expect(second[0]).toBe(first[0]);
    expect((second[0] as unknown as { lngLat: number[] }).lngLat).toEqual([30.01, 50.01]);
  });
});
