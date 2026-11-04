// Debug log for the mission flow. Shown in the browser console; on in development or when
// localStorage 'fleet.debug' is '1'.
const enabled = import.meta.env.DEV || globalThis.localStorage?.getItem('fleet.debug') === '1';

export function debugLog(scope: string, data?: unknown): void {
  if (!enabled) return;
  console.info(`[fleet] ${scope}`, data ?? '');
}
