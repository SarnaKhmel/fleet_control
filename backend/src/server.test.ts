import { NO_WATER } from './water/water.js';
import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createServer, isOriginAllowed, MAX_MESSAGE_BYTES, parseAllowedHosts, portFromEnv } from './server.js';
import { NO_TERRAIN } from './terrain/terrain.js';
import { NO_BUILDINGS } from './buildings/buildings.js';

describe('createServer', () => {
  let close: (() => void) | undefined;

  afterEach(() => close?.());

  it('accepts WebSocket connections', async () => {
    const wss = createServer(0, NO_TERRAIN, NO_BUILDINGS, NO_WATER);
    close = () => wss.close();
    await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
    const port = (wss.address() as { port: number }).port;

    const socket = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });
});

describe('mission over WebSocket', () => {
  it('sends an error for a start outside the mission area', async () => {
    const wss = createServer(0, NO_TERRAIN, NO_BUILDINGS, NO_WATER);
    await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
    const port = (wss.address() as { port: number }).port;
    const socket = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => socket.on('open', () => resolve()));

    const reply = new Promise<unknown>((resolve) => socket.on('message', (raw) => resolve(JSON.parse(raw.toString()))));
    socket.send(
      JSON.stringify({
        type: 'mission_start',
        area: { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 },
        layout: { kind: 'single', point: { lat: 52, lng: 30 } },
        droneCount: 3,
      }),
    );
    expect(await reply).toEqual({ type: 'mission_error', reason: 'outside_area' });

    socket.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});

describe('portFromEnv', () => {
  it('reads a valid port and falls back to 8080 otherwise', () => {
    expect(portFromEnv('10000')).toBe(10000);
    expect(portFromEnv(undefined)).toBe(8080);
    expect(portFromEnv('abc')).toBe(8080);
    expect(portFromEnv('70000')).toBe(8080);
  });
});

describe('origin allow-list', () => {
  it('parses a comma-separated list', () => {
    expect(parseAllowedHosts(' a.com, localhost:5173 ,')).toEqual(['a.com', 'localhost:5173']);
    expect(parseAllowedHosts(undefined)).toEqual([]);
  });

  it('allows everything without a list, and only listed hosts with one', () => {
    expect(isOriginAllowed('https://evil.com', [])).toBe(true);
    expect(isOriginAllowed('https://a.com', ['a.com'])).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', ['localhost:5173'])).toBe(true);
    expect(isOriginAllowed('https://evil.com', ['a.com'])).toBe(false);
    expect(isOriginAllowed('https://a.com.evil.com', ['a.com'])).toBe(false);
    expect(isOriginAllowed(undefined, ['a.com'])).toBe(false);
    expect(isOriginAllowed('not a url', ['a.com'])).toBe(false);
  });
});

describe('server limits', () => {
  async function start(allowedHosts: string[]) {
    const wss = createServer(0, NO_TERRAIN, NO_BUILDINGS, NO_WATER, allowedHosts);
    await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
    return { wss, port: (wss.address() as { port: number }).port };
  }

  it('rejects a connection from a foreign origin', async () => {
    const { wss, port } = await start(['a.com']);
    const socket = new WebSocket(`ws://localhost:${port}`, { origin: 'https://evil.com' });
    const code = await new Promise<number>((resolve) => socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0)));
    expect(code).toBe(401);
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it('accepts a connection from an allowed origin', async () => {
    const { wss, port } = await start(['a.com']);
    const socket = new WebSocket(`ws://localhost:${port}`, { origin: 'https://a.com' });
    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });
    socket.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it('closes a connection that sends an oversized message', async () => {
    const { wss, port } = await start([]);
    const socket = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => socket.on('open', () => resolve()));
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
    socket.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(await closed).toBe(1009);
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});
