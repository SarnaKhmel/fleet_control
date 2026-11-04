import { describe, expect, it } from 'vitest';
import { UNIT_KINDS } from '../../../shared/mission/units';
import { CONTROL_POINT_SIDC, DRONE_SIDC, natoSymbol, targetHighlight, targetSidc, unitSidc } from './nato';

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

  it('draws every kind of unit as a valid symbol: hostile for the enemy, friendly for allies', () => {
    for (const kind of UNIT_KINDS) {
      expect(unitSidc('enemy', kind)).toMatch(/^SHGP/);
      expect(unitSidc('ally', kind)).toMatch(/^SFGP/);
      expect(unitSidc('enemy', kind)).toHaveLength(15);
      expect(natoSymbol(unitSidc('enemy', kind)).isValid()).toBe(true);
    }
    expect(new Set(UNIT_KINDS.map((kind) => unitSidc('enemy', kind))).size).toBe(UNIT_KINDS.length);
  });

  it('adds a direction-of-movement arrow for a unit on the move', () => {
    const standing = natoSymbol(unitSidc('enemy', 'vehicle')).asSVG();
    const moving = natoSymbol(unitSidc('enemy', 'vehicle'), 32, 90).asSVG();
    expect(moving).not.toBe(standing);
    expect(moving.length).toBeGreaterThan(standing.length);
  });
});
