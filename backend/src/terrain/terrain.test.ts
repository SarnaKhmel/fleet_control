import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createTerrain, terrariumElevation, tilePixel, TERRAIN_ZOOM } from './terrain.js';

/** A 256x256 Terrarium tile where every pixel encodes `meters`. */
function flatTile(meters: number): Uint8Array {
  const v = meters + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v % 256);
  const b = Math.round((v - Math.floor(v)) * 256);
  const row = [0, ...Array.from({ length: 256 }, () => [r, g, b]).flat()];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(Array.from({ length: 256 }, () => row).flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('terrain', () => {
  it('decodes Terrarium colors to meters', () => {
    expect(terrariumElevation(128, 0, 0)).toBe(0);
    expect(terrariumElevation(128, 179, 128)).toBe(179.5);
    expect(terrariumElevation(127, 255, 0)).toBe(-1);
  });

  it('finds the tile and pixel of a point (Web Mercator)', () => {
    expect(tilePixel({ lat: 0, lng: 0 }, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
    expect(tilePixel({ lat: 50.45, lng: 30.52 }, 12)).toMatchObject({ x: 2395, y: 1381 });
  });

  it('is unknown until the tile loads, then reads it; each tile is fetched once', async () => {
    const fetcher = vi.fn(async () => flatTile(181));
    const terrain = createTerrain(fetcher);
    expect(terrain.elevationAt({ lat: 50.45, lng: 30.52 })).toBeNull();
    expect(terrain.elevationAt({ lat: 50.451, lng: 30.521 })).toBeNull();
    await flush();
    expect(terrain.elevationAt({ lat: 50.45, lng: 30.52 })).toBe(181);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/2395/1381.png`);
  });

  it('stays unknown for a tile that failed to load, without asking again', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const terrain = createTerrain(fetcher);
    terrain.elevationAt({ lat: 50, lng: 30 });
    await flush();
    expect(terrain.elevationAt({ lat: 50, lng: 30 })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reads a real Terrarium tile', async () => {
    // Saved from the public tile server: Kyiv area, zoom 12.
    const tile = readFileSync(new URL('./fixtures/kyiv-12-2395-1381.png', import.meta.url));
    const terrain = createTerrain(async () => tile);
    terrain.elevationAt({ lat: 50.45, lng: 30.52 });
    await flush();
    const meters = terrain.elevationAt({ lat: 50.45, lng: 30.52 })!;
    // Central Kyiv lies roughly 100 to 200 m above sea level.
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(200);
  });
});
