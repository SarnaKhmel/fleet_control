import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol.js';
import { createMissionController } from './mission/controller.js';

export const DEFAULT_PORT = 8080;

// WebSocket server for the dashboard. Mission messages are validated and handled by the mission
// controller; every server message goes to all connected clients (one shared mission).
export function createServer(port = DEFAULT_PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const broadcast = (message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  const mission = createMissionController(broadcast);

  wss.on('connection', (socket) => {
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
