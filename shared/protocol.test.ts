import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol';

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
      expect(parseClientMessage({ type: 'mission_start', area, layout })).toEqual({ type: 'mission_start', area, layout });
    }
  });

  it('rejects unknown types and malformed payloads', () => {
    expect(parseClientMessage({ type: 'move' })).toBeNull();
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area: { ...area, widthKm: 0 }, layout: { kind: 'single', point: { lat: 50, lng: 30 } } })).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area: { ...area, widthKm: 600 }, layout: { kind: 'single', point: { lat: 50, lng: 30 } } })).toBeNull();
  });

  it('rejects a separate layout that does not have one point per drone', () => {
    expect(parseClientMessage({ type: 'mission_start', area, layout: { kind: 'separate', points: [{ lat: 50, lng: 30 }] } })).toBeNull();
  });

  it('rejects coordinates out of range and clusters larger than the limit', () => {
    expect(parseClientMessage({ type: 'mission_start', area, layout: { kind: 'single', point: { lat: 91, lng: 30 } } })).toBeNull();
    expect(parseClientMessage({ type: 'mission_start', area, layout: { kind: 'cluster', center: { lat: 50, lng: 30 }, radiusM: 9000 } })).toBeNull();
  });

  it('accepts a move command and rejects malformed ones', () => {
    const move = { type: 'move', droneIds: ['drone-1', 'drone-2'], target: { lat: 50.4, lng: 30.5 } };
    expect(parseClientMessage(move)).toEqual(move);
    expect(parseClientMessage({ ...move, droneIds: [] })).toBeNull();
    expect(parseClientMessage({ ...move, droneIds: ['a', 'b', 'c', 'd'] })).toBeNull();
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
});
