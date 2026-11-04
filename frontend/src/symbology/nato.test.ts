import { describe, expect, it } from 'vitest';
import { CONTROL_POINT_SIDC, DRONE_SIDC, natoSymbol, targetHighlight, targetSidc } from './nato';

describe('NATO symbology', () => {
  it('builds a valid symbol for the drone', () => {
    const symbol = natoSymbol(DRONE_SIDC, 32);
    expect(symbol.isValid()).toBe(true);
    expect(symbol.asSVG()).toContain('<svg');
  });

  it('uses unknown affiliation while a target is only detected', () => {
    expect(targetSidc('detected')).toMatch(/^SU/);
  });

  it('uses hostile affiliation once a target is confirmed or engaged', () => {
    expect(targetSidc('confirmed')).toMatch(/^SH/);
    expect(targetSidc('engaged')).toMatch(/^SH/);
  });

  it('marks neutralized targets with the destroyed status', () => {
    expect(targetSidc('neutralized')).toMatch(/^SHGX/);
  });

  it('every target SIDC renders a valid symbol', () => {
    const statuses = ['detected', 'confirmed', 'engaged', 'neutralized'] as const;
    for (const status of statuses) {
      expect(natoSymbol(targetSidc(status)).isValid()).toBe(true);
    }
  });
});

describe('control point', () => {
  it('uses a valid generic control point symbol', () => {
    expect(natoSymbol(CONTROL_POINT_SIDC).isValid()).toBe(true);
  });
});

describe('target states are distinguishable', () => {
  it('engaged has a visual cue that confirmed does not', () => {
    expect(targetHighlight('engaged')).toBe('engaged');
    expect(targetHighlight('confirmed')).toBeNull();
  });
});
