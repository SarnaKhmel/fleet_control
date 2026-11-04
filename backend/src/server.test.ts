import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createServer } from './server.js';

describe('createServer', () => {
  let close: (() => void) | undefined;

  afterEach(() => close?.());

  it('accepts WebSocket connections', async () => {
    const wss = createServer(0);
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
    const wss = createServer(0);
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
