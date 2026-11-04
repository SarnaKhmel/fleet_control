import { describe, expect, it } from 'vitest';
import { batteryLevel } from './battery';

describe('battery level', () => {
  it('is yellow at 30 % and below, red at 10 % and below', () => {
    expect(batteryLevel(100)).toBe('ok');
    expect(batteryLevel(30.1)).toBe('ok');
    expect(batteryLevel(30)).toBe('low');
    expect(batteryLevel(10.1)).toBe('low');
    expect(batteryLevel(10)).toBe('critical');
    expect(batteryLevel(0)).toBe('critical');
  });
});
