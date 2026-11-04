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
