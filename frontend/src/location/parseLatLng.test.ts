import { describe, expect, it } from 'vitest';
import { parseLatLng } from './parseLatLng';

describe('parseLatLng', () => {
  it('accepts comma, semicolon and space separators', () => {
    expect(parseLatLng('50.45, 30.52')).toEqual({ lat: 50.45, lng: 30.52 });
    expect(parseLatLng('50.45;30.52')).toEqual({ lat: 50.45, lng: 30.52 });
    expect(parseLatLng('  -33.9   18.4 ')).toEqual({ lat: -33.9, lng: 18.4 });
  });

  it('rejects malformed input', () => {
    expect(parseLatLng('')).toBeNull();
    expect(parseLatLng('50.45')).toBeNull();
    expect(parseLatLng('a, b')).toBeNull();
    expect(parseLatLng('1, 2, 3')).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseLatLng('91, 0')).toBeNull();
    expect(parseLatLng('0, 181')).toBeNull();
  });
});
