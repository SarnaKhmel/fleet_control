import { describe, expect, it } from 'vitest';
import { isAirborne, MAX_DRONES, MAX_TASKS, parseClientMessage, takesCommands } from './protocol';

const area = { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 };

describe('parseClientMessage', () => {
  it('accepts mission_reset', () => {
    expect(parseClientMessage({ type: 'mission_reset' })).toEqual({ type: 'mission_reset' });
  });

  it('accepts mission_start with each start layout', () => {
    const single = { kind: 'single', point: { lat: 50, lng: 30 } };
    const cluster = { kind: 'cluster', center: { lat: 50, lng: 30 }, radiusM: 500 };
    const separate = { kind: 'separate', points: [{ lat: 50, lng: 30 }, { lat: 50.1, lng: 30 }, { lat: 50.2, lng: 30 }] };
    for (const layout of [single, cluster, separate]) {
      expect(parseClientMessage({ type: 'mission_start', area, layout, droneCount: 3 })).toEqual({ type: 'mission_start', area, layout, droneCount: 3 });
    }
  });

  it('rejects unknown types and malformed payloads', () => {
    expect(parseClientMessage({ type: 'move' })).toBeNull();
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area: { ...area, widthKm: 0 }, layout: { kind: 'single', point: { lat: 50, lng: 30 } }, droneCount: 3 })).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area: { ...area, widthKm: 600 }, layout: { kind: 'single', point: { lat: 50, lng: 30 } }, droneCount: 3 })).toBeNull();
  });

  it('rejects a separate layout that does not have one point per drone', () => {
    const one = { kind: 'separate', points: [{ lat: 50, lng: 30 }] };
    expect(parseClientMessage({ type: 'mission_start', area, layout: one, droneCount: 3 })).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area, layout: one, droneCount: 1 })).toEqual({ type: 'mission_start', area, layout: one, droneCount: 1 });
  });

  it('accepts from 1 to MAX_DRONES drones and nothing else', () => {
    const layout = { kind: 'single', point: { lat: 50, lng: 30 } };
    expect(parseClientMessage({ type: 'mission_start', area, layout, droneCount: MAX_DRONES })).not.toBeNull();
    for (const droneCount of [0, MAX_DRONES + 1, 2.5, '3', undefined]) {
      expect(parseClientMessage({ type: 'mission_start', area, layout, droneCount })).toBeNull();
    }
  });

  it('rejects coordinates out of range and clusters larger than the limit', () => {
    expect(parseClientMessage({ type: 'mission_start', area, layout: { kind: 'single', point: { lat: 91, lng: 30 } }, droneCount: 3 })).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area, layout: { kind: 'cluster', center: { lat: 50, lng: 30 }, radiusM: 9000 }, droneCount: 3 })).toBeNull();
  });

  it('accepts a move command and rejects malformed ones', () => {
    const move = { type: 'move', droneIds: ['drone-1', 'drone-2'], target: { lat: 50.4, lng: 30.5 } };
    expect(parseClientMessage(move)).toEqual(move);
    expect(parseClientMessage({ ...move, droneIds: [] })).toBeNull();
    expect(parseClientMessage({ ...move, droneIds: Array.from({ length: MAX_DRONES + 1 }, (_, i) => `drone-${i + 1}`) })).toBeNull();
    expect(parseClientMessage({ ...move, target: { lat: 99, lng: 0 } })).toBeNull();
  });

  it('accepts a heading command and rejects an out-of-range heading', () => {
    const heading = { type: 'heading', droneIds: ['drone-1'], headingDeg: 45 };
    expect(parseClientMessage(heading)).toEqual(heading);
    expect(parseClientMessage({ ...heading, headingDeg: 360 })).toBeNull();
  });

  it('accepts a route of control points for one drone', () => {
    const route = { type: 'route', droneId: 'drone-2', points: [{ lat: 50.1, lng: 30 }, { lat: 50.2, lng: 30.1 }] };
    expect(parseClientMessage(route)).toEqual(route);
    expect(parseClientMessage({ ...route, points: [] })).toBeNull();
  });

  it('accepts a move that appends to the tasks and rejects a non-boolean append', () => {
    const move = { type: 'move', droneIds: ['drone-1'], target: { lat: 50.4, lng: 30.5 }, append: true };
    expect(parseClientMessage(move)).toEqual(move);
    expect(parseClientMessage({ ...move, append: false })).toEqual({ type: 'move', droneIds: ['drone-1'], target: { lat: 50.4, lng: 30.5 } });
    expect(parseClientMessage({ ...move, append: 'yes' })).toBeNull();
  });

  it('accepts hold for a list of drones', () => {
    expect(parseClientMessage({ type: 'hold', droneIds: ['drone-1'] })).toEqual({ type: 'hold', droneIds: ['drone-1'] });
    expect(parseClientMessage({ type: 'hold', droneIds: [] })).toBeNull();
  });

  it('accepts land for a list of drones', () => {
    expect(parseClientMessage({ type: 'land', droneIds: ['drone-1', 'drone-2'] })).toEqual({ type: 'land', droneIds: ['drone-1', 'drone-2'] });
    expect(parseClientMessage({ type: 'land', droneIds: [] })).toBeNull();
    expect(parseClientMessage({ type: 'land', droneIds: [7] })).toBeNull();
    expect(parseClientMessage({ type: 'land', droneIds: Array.from({ length: MAX_DRONES + 1 }, (_, i) => `drone-${i}`) })).toBeNull();
  });

  it('tells which drones take commands and which are in the air', () => {
    expect(['idle', 'moving', 'landing', 'landed', 'lost_link', 'destroyed', 'booting', null].map(takesCommands)).toEqual([true, true, true, true, false, false, false, false]);
    expect(['idle', 'moving', 'landing', 'landed', 'lost_link', 'destroyed', 'booting', null].map(isAirborne)).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('accepts remove_task with a whole index inside the task limit', () => {
    const remove = { type: 'remove_task', droneId: 'drone-1', index: 2 };
    expect(parseClientMessage(remove)).toEqual(remove);
    for (const index of [-1, 1.5, MAX_TASKS, '0', undefined]) expect(parseClientMessage({ ...remove, index })).toBeNull();
    expect(parseClientMessage({ ...remove, droneId: '' })).toBeNull();
  });

  it('accepts update_task with a valid index and point', () => {
    const update = { type: 'update_task', droneId: 'drone-1', index: 0, point: { lat: 50.1, lng: 30.2 } };
    expect(parseClientMessage(update)).toEqual(update);
    expect(parseClientMessage({ ...update, index: MAX_TASKS })).toBeNull();
    expect(parseClientMessage({ ...update, index: MAX_TASKS - 1 })).toEqual({ ...update, index: MAX_TASKS - 1 });
    expect(parseClientMessage({ ...update, point: { lat: 91, lng: 0 } })).toBeNull();
    expect(parseClientMessage({ ...update, point: undefined })).toBeNull();
  });
});
