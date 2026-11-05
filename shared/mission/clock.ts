// The mission clock: simulated time runs with real time, at the speed the operator sets. The speeds the
// operator can choose, as simulated seconds per real second; 0 is paused, and that is a flag, not a speed.

export const SIM_SPEEDS = [1, 2, 3, 4, 5, 10] as const;

export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** The mission clock as the dashboard sees it: when the mission started (wall clock), simulated seconds since, speed, pause. */
export interface MissionClockView {
  startedAt: string | null;
  simulatedS: number;
  speed: number;
  paused: boolean;
}

export function isSimSpeed(value: unknown): value is SimSpeed {
  return (SIM_SPEEDS as readonly unknown[]).includes(value);
}
