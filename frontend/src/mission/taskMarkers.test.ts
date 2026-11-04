import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMap, markerInstances } from '../test/maplibreMock';
import type { DroneView } from './missionStore';
import { removeDroneTask, updateDroneTask } from './missionSocket';
import { syncTaskMarkers } from './taskMarkers';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));
vi.mock('./missionSocket', () => ({ removeDroneTask: vi.fn(), updateDroneTask: vi.fn() }));

const drone = (tasks: { lat: number; lng: number }[]): DroneView => ({ callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 10, batteryPct: 90, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks });
const live = () => markerInstances.filter((m) => m.added);

describe('task markers', () => {
  let map: FakeMap;
  beforeEach(() => {
    map = new FakeMap({ style: 'x' });
    syncTaskMarkers(map as never, {}, []); // clears markers left by an earlier test
    markerInstances.length = 0;
    vi.mocked(removeDroneTask).mockClear();
    vi.mocked(updateDroneTask).mockClear();
  });

  it('shows numbered, draggable task points of the selected drones only', () => {
    const drones = { 'drone-1': drone([{ lat: 50.1, lng: 30.1 }, { lat: 50.2, lng: 30.2 }]), 'drone-2': drone([{ lat: 51, lng: 31 }]) };
    syncTaskMarkers(map as never, drones, ['drone-1']);
    expect(live().map((m) => [m.element?.textContent, m.lngLat, m.draggable])).toEqual([
      ['1', [30.1, 50.1], true],
      ['2', [30.2, 50.2], true],
    ]);
    syncTaskMarkers(map as never, drones, ['drone-1', 'drone-2']);
    expect(live()).toHaveLength(3);
    syncTaskMarkers(map as never, drones, []);
    expect(live()).toHaveLength(0);
  });

  it('sends the new point when a marker is dropped, and is not moved back while dragged', () => {
    const drones = { 'drone-1': drone([{ lat: 50.1, lng: 30.1 }]) };
    syncTaskMarkers(map as never, drones, ['drone-1']);
    const marker = live()[0];
    marker.fire('dragstart');
    marker.lngLat = [30.5, 50.5];
    syncTaskMarkers(map as never, drones, ['drone-1']); // a position update during the drag
    expect(marker.lngLat).toEqual([30.5, 50.5]);
    marker.fire('dragend');
    expect(updateDroneTask).toHaveBeenCalledWith('drone-1', 0, { lat: 50.5, lng: 30.5 });
  });

  it('removes the task on right-click', () => {
    syncTaskMarkers(map as never, { 'drone-1': drone([{ lat: 50.1, lng: 30.1 }, { lat: 50.2, lng: 30.2 }]) }, ['drone-1']);
    const event = new MouseEvent('contextmenu', { cancelable: true });
    live()[1].element!.dispatchEvent(event);
    expect(removeDroneTask).toHaveBeenCalledWith('drone-1', 1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the tasks of a lost drone locked: not draggable, no right-click removal', () => {
    const tasks = [{ lat: 50.1, lng: 30.1 }];
    syncTaskMarkers(map as never, { 'drone-1': drone(tasks) }, ['drone-1']);
    syncTaskMarkers(map as never, { 'drone-1': { ...drone(tasks), status: 'lost_link' } }, ['drone-1']);
    const [marker] = live();
    expect(live()).toHaveLength(1);
    expect(marker.draggable).toBe(false);
    expect(marker.element?.classList.contains('is-locked')).toBe(true);
    marker.element!.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
    expect(removeDroneTask).not.toHaveBeenCalled();
  });
});
