import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { createMissionController } from './mission/controller.js';
import { createTerrain, type Terrain } from './terrain/terrain.js';
import { createBuildings, type Buildings } from './buildings/buildings.js';
import { createWater, type Water } from './water/water.js';

export const DEFAULT_PORT = 8080;

// WebSocket server for the dashboard. Mission messages are validated and handled by the mission
// controller; every server message goes to all connected clients (one shared mission).
export function createServer(port = DEFAULT_PORT, terrain: Terrain = createTerrain(), buildings: Buildings = createBuildings(), water: Water = createWater()): WebSocketServer {
  const wss = new WebSocketServer({ port });
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
  createServer();
  console.log(`WebSocket server listening on ws://localhost:${DEFAULT_PORT}`);
}
