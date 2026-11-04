import { describe, expect, it } from 'vitest';
import { compassPoint } from './compass';

describe('compassPoint', () => {
  it('maps the cardinal and intercardinal bearings', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(225)).toBe('SW');
  });

  it('wraps around 360 degrees', () => {
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(-10)).toBe('N');
  });
});
