// Battery warning levels: yellow at 30 % and below, red at 10 % and below.
export const BATTERY_LOW_PCT = 30;
export const BATTERY_CRITICAL_PCT = 10;

export type BatteryLevel = 'ok' | 'low' | 'critical';

export function batteryLevel(pct: number): BatteryLevel {
  if (pct <= BATTERY_CRITICAL_PCT) return 'critical';
  if (pct <= BATTERY_LOW_PCT) return 'low';
  return 'ok';
}
