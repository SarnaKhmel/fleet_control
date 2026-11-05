// Mission debug log on the server console. Enabled unless FLEET_DEBUG=0.
const enabled = process.env.FLEET_DEBUG !== '0';

export function serverLog(scope: string, data?: unknown): void {
  if (!enabled) return;
  console.log(`[mission] ${new Date().toISOString().slice(11, 19)} ${scope}`, data ?? '');
}
