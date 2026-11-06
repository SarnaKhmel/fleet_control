import { describe, expect, it } from 'vitest';
import { landableSelected, missionSocketUrl, parseServerMessage } from './missionSocket';

describe('missionSocketUrl', () => {
  const httpsPage = { protocol: 'https:', host: 'fleet.example' };
  const httpPage = { protocol: 'http:', host: 'localhost:5173' };

  it('uses the page host when no server host is set (dev proxy, same origin)', () => {
    expect(missionSocketUrl(undefined, httpPage)).toBe('ws://localhost:5173/ws');
    expect(missionSocketUrl(undefined, httpsPage)).toBe('wss://fleet.example/ws');
  });

  it('connects to a separately hosted server, over wss when the page is https', () => {
    expect(missionSocketUrl('fleet-backend.onrender.com', httpsPage)).toBe('wss://fleet-backend.onrender.com/ws');
    expect(missionSocketUrl('fleet-backend.onrender.com', httpPage)).toBe('ws://fleet-backend.onrender.com/ws');
  });

  it('treats an empty server host as not set', () => {
    expect(missionSocketUrl('', httpPage)).toBe('ws://localhost:5173/ws');
  });
});

describe('parseServerMessage', () => {
  it('accepts known server messages', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'mission_reset' }))).toEqual({ type: 'mission_reset' });
    expect(parseServerMessage(JSON.stringify({ type: 'mission_error', reason: 'outside_area' }))).toEqual({
      type: 'mission_error',
      reason: 'outside_area',
    });
  });

  it('accepts drone task lists', () => {
    const tasks = { type: 'drone_tasks', droneId: 'drone-1', trail: [], tasks: [{ lat: 50, lng: 30 }] };
    expect(parseServerMessage(JSON.stringify(tasks))).toEqual(tasks);
  });

  it('accepts drone status changes', () => {
    const status = { type: 'drone_status', droneId: 'drone-1', status: 'landed' };
    expect(parseServerMessage(JSON.stringify(status))).toEqual(status);
  });

  it('accepts collision warnings', () => {
    const warning = { type: 'drone_warning', droneId: 'drone-1', warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } };
    expect(parseServerMessage(JSON.stringify(warning))).toEqual(warning);
  });

  it('accepts new seen ground', () => {
    const recon = { type: 'recon_cells', grid: { origin: { lat: 50, lng: 30 }, cellM: 100 }, cells: [[0, 1]] };
    expect(parseServerMessage(JSON.stringify(recon))).toEqual(recon);
    const units = { type: 'units', units: [{ id: 'enemy-1', side: 'enemy', kind: 'radar', position: { lat: 50, lng: 30 }, headingDeg: null, speedMs: 0, source: 'intel', detectedByDroneId: null, inSight: false }] };
    expect(parseServerMessage(JSON.stringify(units))).toEqual(units);
  });

  it('drops unknown types, bad JSON and non-strings', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'move' }))).toBeNull();
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage(42)).toBeNull();
  });
});

describe('landableSelected', () => {
  it('picks the selected drones in the air that are not already coming down', () => {
    const drones = { a: { status: 'idle' }, b: { status: 'moving' }, c: { status: 'landing' }, d: { status: 'landed' }, e: { status: 'destroyed' }, f: { status: 'idle' } };
    expect(landableSelected(drones, ['a', 'b', 'c', 'd', 'e', 'missing'])).toEqual(['a', 'b']);
  });
});
