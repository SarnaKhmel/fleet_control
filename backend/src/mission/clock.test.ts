import { describe, expect, it } from 'vitest';
import { isSimSpeed } from '../../../shared/mission/clock.js';
import { MissionClock } from './clock.js';

describe('mission clock', () => {
  it('runs simulated time with real time at the chosen speed, and only while a mission runs', () => {
    const clock = new MissionClock();
    expect(clock.advance(1000)).toBe(0);
    clock.start('2026-11-05T10:00:00Z');
    expect(clock.advance(1000)).toBe(1);
    clock.speed = 5;
    expect(clock.advance(2000)).toBe(10);
    expect(clock.simulatedS).toBe(11);
    clock.stop();
    expect(clock.startedAt).toBeNull();
    expect(clock.simulatedS).toBe(0);
  });

  it('stands still while paused, and goes on at the same speed after', () => {
    const clock = new MissionClock();
    clock.start('2026-11-05T10:00:00Z');
    clock.paused = true;
    expect(clock.advance(5000)).toBe(0);
    clock.paused = false;
    expect(clock.advance(1000)).toBe(1);
  });

  it('accepts only the speeds the operator can choose', () => {
    expect([1, 2, 3, 4, 5, 10].every(isSimSpeed)).toBe(true);
    expect(isSimSpeed(0)).toBe(false);
    expect(isSimSpeed(6)).toBe(false);
    expect(isSimSpeed('2')).toBe(false);
  });
});
