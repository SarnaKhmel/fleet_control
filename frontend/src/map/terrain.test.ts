import { describe, expect, it } from 'vitest';
import { TERRAIN_TILES_URL } from './terrain';

describe('terrain', () => {
  it('uses Terrarium-encoded tiles with {z}/{x}/{y} placeholders', () => {
    expect(TERRAIN_TILES_URL).toContain('terrarium');
    expect(TERRAIN_TILES_URL).toContain('{z}/{x}/{y}.png');
  });
});
