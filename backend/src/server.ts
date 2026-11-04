import { WebSocketServer } from 'ws';

export const DEFAULT_PORT = 8080;

// Starts the WebSocket server that will broadcast simulated drone telemetry.
// Simulation and the protocol messages from tasks/tech.md are added in milestone 1.
export function createServer(port = DEFAULT_PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (socket) => {
    socket.on('message', () => {
      // Client messages are validated and handled in a later step.
    });
  });
  return wss;
}

// Entry point when run directly (npm run dev / npm start).
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer();
  console.log(`WebSocket server listening on ws://localhost:${DEFAULT_PORT}`);
}
