import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createBuildings, isInside, parseBuildingTile, type Building } from './buildings.js';
import { OPENFREEMAP_TILEJSON_URL } from '../vectorTiles.js';

// Saved from OpenFreeMap: central Kyiv, zoom 14, tile 9581/5524.
const kyiv = readFileSync(new URL('./fixtures/kyiv-14-9581-5524.pbf', import.meta.url));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const square = (south: number, west: number, size: number) => [
  { lat: south, lng: west },
  { lat: south, lng: west + size },
  { lat: south + size, lng: west + size },
  { lat: south + size, lng: west },
  { lat: south, lng: west },
];
const building = (rings: Building['rings'], heightM = 20): Building => {
  const points = rings.flat();
  return { rings, heightM, south: Math.min(...points.map((p) => p.lat)), north: Math.max(...points.map((p) => p.lat)), west: Math.min(...points.map((p) => p.lng)), east: Math.max(...points.map((p) => p.lng)) };
};

/** A point inside the building, found on a grid over its bounds. */
function pointIn(b: Building) {
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const p = { lat: b.south + ((b.north - b.south) * i) / 20, lng: b.west + ((b.east - b.west) * j) / 20 };
      if (isInside(p, b)) return p;
    }
  }
  throw new Error('no inner point');
}

describe('buildings', () => {
  it('tells whether a point is inside an outline, holes excluded', () => {
    const courtyard = building([square(50, 30, 0.001), square(50.0004, 30.0004, 0.0002)]);
    expect(isInside({ lat: 50.0001, lng: 30.0001 }, courtyard)).toBe(true);
    expect(isInside({ lat: 50.0005, lng: 30.0005 }, courtyard)).toBe(false); // in the courtyard
    expect(isInside({ lat: 50.002, lng: 30.0005 }, courtyard)).toBe(false);
  });

  it('reads the outlines and heights of a real tile, inside its bounds', () => {
    const buildings = parseBuildingTile(kyiv, 9581, 5524, 14);
    expect(buildings.length).toBeGreaterThan(100);
    // Tile 9581/5524 at zoom 14 spans 30.52002..30.54199 east and 50.44351..50.45750 north; outlines at
    // the edge run over it by the tile buffer (64 of 4096 units, about 0.0004 degrees here).
    const buffer = 0.0004;
    for (const b of buildings) {
      expect(b.west).toBeGreaterThan(30.52002 - buffer);
      expect(b.east).toBeLessThan(30.54199 + buffer);
      expect(b.south).toBeGreaterThan(50.44351 - buffer);
      expect(b.north).toBeLessThan(50.4575 + buffer);
    }
    expect(Math.max(...buildings.map((b) => b.heightM))).toBe(85);
  });

  it('finds the tallest building over a point once its tile is in; nothing before', async () => {
    const tiles = parseBuildingTile(kyiv, 9581, 5524, 14);
    const tallest = tiles.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const point = pointIn(tallest);
    const fetcher = vi.fn(async (url: string) =>
      url === OPENFREEMAP_TILEJSON_URL ? new TextEncoder().encode(JSON.stringify({ tiles: ['https://tiles.example/v1/{z}/{x}/{y}.pbf'] })) : kyiv,
    );
    const buildings = createBuildings(fetcher);
    expect(buildings.at(point)).toBeNull();
    await flush();
    await flush();
    expect(buildings.at(point)?.heightM).toBe(85);
    // A spot in the tile with no building over it (found from the parsed outlines).
    const open = Array.from({ length: 400 }, (_, i) => ({ lat: 50.4436 + (Math.floor(i / 20) * 0.0138) / 20, lng: 30.5201 + ((i % 20) * 0.0218) / 20 })).find((p) => tiles.every((b) => !isInside(p, b)))!;
    expect(buildings.at(open)).toBeNull();
    expect(fetcher).toHaveBeenCalledWith('https://tiles.example/v1/14/9581/5524.pbf');
    expect(fetcher).toHaveBeenCalledTimes(2); // the TileJSON once, the tile once
  });

  it('knows no buildings where the tiles cannot be loaded', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const buildings = createBuildings(fetcher);
    buildings.at({ lat: 50.45, lng: 30.52 });
    await flush();
    await flush();
    expect(buildings.at({ lat: 50.45, lng: 30.52 })).toBeNull();
  });
});
