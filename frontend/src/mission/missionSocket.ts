import type { ClientMessage, ServerMessage } from '../../../shared/protocol';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';
import type { LatLng } from '../../../shared/protocol';

const SERVER_TYPES = new Set(['drone_boot', 'drone_online', 'position', 'mission_error', 'mission_reset']);

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
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelayMs = 1000;
const MAX_RETRY_DELAY_MS = 10_000;

function connect(url: string) {
  socket = new WebSocket(url);
  socket.onopen = () => {
    retryDelayMs = 1000;
  };
  socket.onmessage = (event) => {
    const message = parseServerMessage(event.data);
    if (message) useMissionStore.getState().apply(message);
  };
  socket.onclose = () => {
    socket = null;
    // Reconnect with a growing pause, so a restarted server is picked up without a page reload.
    retryTimer = setTimeout(() => connect(url), retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  };
}

/** Opens the connection and keeps it alive: reconnects after the server restarts. */
export function startMissionSocket(url = missionSocketUrl()): void {
  if (socket || retryTimer) return;
  connect(url);
}

/** Sends an intent to the server. Returns false when not connected. */
export function sendClientMessage(message: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

/** Sends a move for the selected online drones, or for all online drones when none is selected. */
export function moveOnlineDrones(target: LatLng): number {
  const online = Object.entries(useMissionStore.getState().drones)
    .filter(([, drone]) => drone.status === 'idle')
    .map(([id]) => id);
  const selected = useSelectionStore.getState().selectedIds;
  const droneIds = selected.length > 0 ? online.filter((id) => selected.includes(id)) : online;
  if (droneIds.length === 0) return 0;
  return sendClientMessage({ type: 'move', droneIds, target }) ? droneIds.length : 0;
}
