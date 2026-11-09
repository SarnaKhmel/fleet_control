import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { createMissionController } from './mission/controller.js';
import { createTerrain, type Terrain } from './terrain/terrain.js';
import { createBuildings, type Buildings } from './buildings/buildings.js';
import { createWater, type Water } from './water/water.js';

export const DEFAULT_PORT = 8080;

/** Largest accepted client message; the biggest valid one (a 500-point route) is about 20 KiB. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** The port from the PORT env var; the default when it is missing or not a valid port. */
export function portFromEnv(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** ALLOWED_ORIGIN_HOSTS: comma-separated hosts (`example.com`, `localhost:5173`). Empty means no restriction. */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? '').split(',').map((host) => host.trim()).filter(Boolean);
}

/** True when `origin` (the browser's Origin header) belongs to one of `allowedHosts`; always true without a list. */
export function isOriginAllowed(origin: string | undefined, allowedHosts: string[]): boolean {
  if (allowedHosts.length === 0) return true;
  if (!origin) return false;
  try {
    return allowedHosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

// WebSocket server for the dashboard. Mission messages are validated and handled by the mission
// controller; every server message goes to all connected clients (one shared mission).
export function createServer(port = DEFAULT_PORT, terrain: Terrain = createTerrain(), buildings: Buildings = createBuildings(), water: Water = createWater(), allowedHosts: string[] = []): WebSocketServer {
  const wss = new WebSocketServer({
    port,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin?: string }) => isOriginAllowed(origin, allowedHosts),
  });
  const broadcast = (message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  const mission = createMissionController(broadcast, undefined, terrain, buildings, undefined, water);

  wss.on('connection', (socket) => {
    // A client that connects or reconnects during a mission gets the current state first.
    socket.send(JSON.stringify(mission.snapshot()));
    // ws reports protocol errors (e.g. a message over maxPayload) here and closes the socket itself;
    // without a listener the error would crash the whole server.
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return; // not JSON: ignore
      }
      const message = parseClientMessage(parsed);
      if (message) mission.handle(message);
    });
  });

  wss.on('close', () => mission.dispose());
  return wss;
}

// Entry point when run directly (npm run dev / npm start).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = portFromEnv(process.env.PORT);
  createServer(port, undefined, undefined, undefined, parseAllowedHosts(process.env.ALLOWED_ORIGIN_HOSTS));
  console.log(`WebSocket server listening on port ${port}`);
}
