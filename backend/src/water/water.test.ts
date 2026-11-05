import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offsetLatLng } from '../../../shared/mission/area.js';
import { createWater, isOnShape, parseWaterTile, RIVER_HALF_M, type WaterShape } from './water.js';
import { OPENFREEMAP_TILEJSON_URL } from '../vectorTiles.js';

const kyiv = new Uint8Array(readFileSync(new URL('./fixtures/kyiv-10-598-345.pbf', import.meta.url)));
const kyivShapes = parseWaterTile(kyiv, 598, 345, 10);

describe('water', () => {
  it('reads the lakes, the wide rivers and the narrow river lines of a real tile', () => {
    expect(kyivShapes.filter((s) => s.kind === 'area').length).toBeGreaterThan(50);
    expect(kyivShapes.filter((s) => s.kind === 'river').length).toBeGreaterThan(10);
  });

  it('knows a point on a lake is water and the middle of Kyiv is not', () => {
    const lake = { lat: 50.48894, lng: 30.55932 };
    const centre = { lat: 50.4501, lng: 30.5234 };
    expect(kyivShapes.some((s) => isOnShape(lake, s))).toBe(true);
    expect(kyivShapes.some((s) => isOnShape(centre, s))).toBe(false);
  });

  it('knows the centerline of a river is water', () => {
    const river = kyivShapes.find((s) => s.kind === 'river')!;
    const mid = river.kind === 'river' ? river.line[Math.floor(river.line.length / 2)] : null;
    expect(mid && isOnShape(mid, river)).toBe(true);
  });

  it('counts a narrow river as water only within its half-width of the line', () => {
    const origin = { lat: 50, lng: 30 };
    const river: WaterShape = { kind: 'river', line: [origin, offsetLatLng(origin, 1000, 0)] };
    expect(isOnShape(offsetLatLng(origin, 500, RIVER_HALF_M - 2), river)).toBe(true);
    expect(isOnShape(offsetLatLng(origin, 500, RIVER_HALF_M + 5), river)).toBe(false);
    expect(isOnShape(offsetLatLng(origin, 1100, 0), river)).toBe(false); // past the end of the line
  });

  it('reads as land until its tile is in, then as water on the lake', async () => {
    const lake = { lat: 50.48894, lng: 30.55932 };
    const fetcher = async (url: string) =>
      url === OPENFREEMAP_TILEJSON_URL ? new TextEncoder().encode(JSON.stringify({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] })) : kyiv;
    const water = createWater(fetcher);
    expect(water.isWater(lake)).toBe(false);
    await water.loaded([lake]);
    expect(water.isWater(lake)).toBe(true);
  });
});
