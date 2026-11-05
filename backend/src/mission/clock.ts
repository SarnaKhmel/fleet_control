import type { SimSpeed } from '../../../shared/mission/clock.js';

// The mission clock: simulated seconds pass with real ones at the operator's speed, and not at all while paused
// or when no mission runs. The simulation takes its time from here, so a speed-up or a pause changes nothing else.

export class MissionClock {
  /** Wall-clock time the mission started (ISO), or null when none runs. */
  startedAt: string | null = null;
  /** Simulated seconds since the start. */
  simulatedS = 0;
  speed: SimSpeed | number = 1;
  paused = false;

  start(startedAt: string): void {
    this.startedAt = startedAt;
    this.simulatedS = 0;
  }

  stop(): void {
    this.startedAt = null;
    this.simulatedS = 0;
  }

  /** The simulated seconds that pass during `realMs` of real time; none while paused or stopped. */
  advance(realMs: number): number {
    if (this.startedAt === null || this.paused) return 0;
    const passed = (realMs / 1000) * this.speed;
    this.simulatedS += passed;
    return passed;
  }
}
