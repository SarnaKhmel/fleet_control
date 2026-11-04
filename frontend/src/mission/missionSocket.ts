import type { ClientMessage, ServerMessage } from '../../../shared/protocol';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';
import { takesCommands, type LatLng } from '../../../shared/protocol';
import { toMetersFrom } from '../../../shared/mission/area';
import { useWindStore } from '../wind/windStore';
import { debugLog } from '../log';

const SERVER_TYPES = new Set(['mission_snapshot', 'drone_boot', 'drone_online', 'position', 'drone_tasks', 'drone_status', 'mission_error', 'mission_reset']);

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
    const { status, wind } = useWindStore.getState();
    if (status === 'ready') sendClientMessage({ type: 'wind', speedMs: wind.speedMs, fromDeg: wind.fromDeg });
  };
  socket.onmessage = (event) => {
    const message = parseServerMessage(event.data);
    if (message) useMissionStore.getState().apply(message);
  };
  socket.onclose = () => {
    socket = null;
    // The server's mission state is unknown while disconnected: show it as idle until the snapshot arrives.
    useMissionStore.getState().apply({ type: 'mission_reset' });
    // Reconnect with a growing pause, so a restarted server is picked up without a page reload.
    retryTimer = setTimeout(() => connect(url), retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  };
}

/** Opens the connection and keeps it alive: reconnects after the server restarts. */
export function startMissionSocket(url = missionSocketUrl()): void {
  if (socket || retryTimer) return;
  connect(url);
  // The server flies drones through the same wind the operator sees.
  useWindStore.subscribe((state, previous) => {
    if (state.status === 'ready' && (state.wind !== previous.wind || previous.status !== 'ready')) {
      sendClientMessage({ type: 'wind', speedMs: state.wind.speedMs, fromDeg: state.wind.fromDeg });
    }
  });
}

/** Sends an intent to the server. Returns false when not connected. */
export function sendClientMessage(message: ClientMessage): boolean {
  const sent = !!socket && socket.readyState === WebSocket.OPEN;
  debugLog(`send ${message.type}${sent ? '' : ' (NOT SENT: no connection)'}`, message);
  if (!sent) return false;
  socket!.send(JSON.stringify(message));
  return true;
}

/**
 * Sends a move for the selected online drones.
 * With `append` the point goes to the end of each drone's tasks instead of replacing them.
 */
export function moveOnlineDrones(target: LatLng, append = false): number {
  const online = Object.entries(useMissionStore.getState().drones)
    .filter(([, drone]) => takesCommands(drone.status))
    .map(([id]) => id);
  const selected = useSelectionStore.getState().selectedIds;
  const droneIds = online.filter((id) => selected.includes(id));
  debugLog('move click', { target, append, selected, online, sending: droneIds });
  if (droneIds.length === 0) return 0;
  const message: ClientMessage = append ? { type: 'move', droneIds, target, append } : { type: 'move', droneIds, target };
  return sendClientMessage(message) ? droneIds.length : 0;
}

/** Drops one task from a drone's list (0 = the current one). */
export function removeDroneTask(droneId: string, index: number): boolean {
  return sendClientMessage({ type: 'remove_task', droneId, index });
}

/** Moves one task of a drone's list to another point. */
export function updateDroneTask(droneId: string, index: number, point: LatLng): boolean {
  return sendClientMessage({ type: 'update_task', droneId, index, point });
}

/** Selected drones that can be landed: online and in the air, not already coming down. */
export function landableSelected(drones: Record<string, { status: string }>, selectedIds: string[]): string[] {
  return selectedIds.filter((id) => drones[id]?.status === 'idle' || drones[id]?.status === 'moving');
}

/** Lands the selected drones that are in the air. Returns how many were sent. */
export function landSelectedDrones(): number {
  const droneIds = landableSelected(useMissionStore.getState().drones, useSelectionStore.getState().selectedIds);
  if (droneIds.length === 0) return 0;
  return sendClientMessage({ type: 'land', droneIds }) ? droneIds.length : 0;
}

/** Drops all of a drone's tasks: it hovers where it is. */
export function clearDroneTasks(droneId: string): boolean {
  return sendClientMessage({ type: 'hold', droneIds: [droneId] });
}

/**
 * Sends the selected online drones on a course: the heading from the first selected drone toward the point.
 * Returns how many drones were sent.
 */
export function headOnlineDronesToward(target: LatLng): number {
  const drones = useMissionStore.getState().drones;
  const ids = useSelectionStore
    .getState()
    .selectedIds.filter((id) => takesCommands(drones[id]?.status) && drones[id]?.position);
  if (ids.length === 0) return 0;
  const from = drones[ids[0]].position;
  if (!from) return 0;
  const { east, north } = toMetersFrom(from, target);
  const headingDeg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return sendClientMessage({ type: 'heading', droneIds: ids, headingDeg }) ? ids.length : 0;
}
