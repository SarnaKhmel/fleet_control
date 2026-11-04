import { describe, expect, it } from 'vitest';
import { isInsideArea } from './area';

const area = { center: { lat: 50, lng: 30 }, widthKm: 200, heightKm: 200 };

describe('isInsideArea', () => {
  it('accepts the center and points within half the size', () => {
    expect(isInsideArea({ lat: 50, lng: 30 }, area)).toBe(true);
    expect(isInsideArea({ lat: 50.8, lng: 30 }, area)).toBe(true); // ~89 km north
  });

  it('rejects points beyond half the size', () => {
    expect(isInsideArea({ lat: 51.0, lng: 30 }, area)).toBe(false); // ~111 km north
  });
});
