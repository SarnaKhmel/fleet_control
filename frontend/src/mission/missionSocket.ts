import type { ClientMessage, ServerMessage } from '../../../shared/protocol';
import { useMissionStore } from './missionStore';

const SERVER_TYPES = new Set(['drone_boot', 'drone_online', 'mission_error', 'mission_reset']);

/** Parses a server message, or null for anything unknown or malformed. Trust boundary for the client. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const type = (data as { type?: unknown })?.type;
  if (typeof type !== 'string' || !SERVER_TYPES.has(type)) return null;
  return data as ServerMessage;
}

export function missionSocketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}

let socket: WebSocket | null = null;

/** Opens the connection once and routes server messages into the mission store. */
export function startMissionSocket(url = missionSocketUrl()): void {
  if (socket) return;
  socket = new WebSocket(url);
  socket.onmessage = (event) => {
    const message = parseServerMessage(event.data);
    if (message) useMissionStore.getState().apply(message);
  };
  socket.onclose = () => {
    socket = null;
  };
}

/** Sends an intent to the server. Returns false when not connected. */
export function sendClientMessage(message: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}
