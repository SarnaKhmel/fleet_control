import { describe, expect, it } from 'vitest';
import { locationPinElement } from './locationPin';

describe('locationPinElement', () => {
  it('is a teardrop pointer with a dot, not a NATO symbol', () => {
    const el = locationPinElement();
    expect(el.classList.contains('location-pin')).toBe(true);
    expect(el.querySelector('svg circle')).toBeTruthy();
    expect(el.querySelector('.nato-symbol')).toBeNull();
  });
});
