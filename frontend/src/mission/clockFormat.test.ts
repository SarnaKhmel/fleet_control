import { describe, expect, it } from 'vitest';
import { formatDuration, formatStart } from './clockFormat';

describe('clock format', () => {
  it('shows simulated time as hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(3723.9)).toBe('1:02:03');
    expect(formatDuration(90_000)).toBe('25:00:00');
    expect(formatDuration(-5)).toBe('0:00:00');
  });

  it('shows the start as a local wall-clock time', () => {
    const start = new Date(2026, 10, 5, 9, 5, 7).toISOString();
    expect(formatStart(start)).toBe('09:05:07');
  });
});
