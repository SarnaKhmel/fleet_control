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
});
