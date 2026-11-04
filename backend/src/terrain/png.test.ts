import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png.js';

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, body, Buffer.alloc(4)]); // the CRC is not checked
}

/** A PNG with the given filtered rows (each row: filter byte + bytes), as an encoder would write it. */
function png(width: number, height: number, color: number, rows: number[][], interlace = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, color, 0, 0, interlace], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows.flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('decodePng', () => {
  it('undoes every row filter of an RGB image', () => {
    // 2x5 RGB, all pixels expected as listed below; each row uses a different filter.
    const rows = [
      [0, 10, 20, 30, 40, 50, 60], // none
      [1, 11, 21, 31, 1, 1, 1], // sub: second pixel = first + 1
      [2, 1, 1, 1, 2, 2, 2], // up: row above + delta
      [3, 6, 11, 16, 26, 26, 26], // average of left and up
      [4, 1, 1, 1, 1, 1, 1], // paeth
    ];
    const image = decodePng(png(2, 5, 2, rows));
    expect(image).toMatchObject({ width: 2, height: 5, channels: 3 });
    const pixel = (x: number, y: number) => Array.from(image.pixels.subarray((y * 2 + x) * 3, (y * 2 + x) * 3 + 3));
    expect([pixel(0, 0), pixel(1, 0)]).toEqual([[10, 20, 30], [40, 50, 60]]);
    expect([pixel(0, 1), pixel(1, 1)]).toEqual([[11, 21, 31], [12, 22, 32]]);
    expect([pixel(0, 2), pixel(1, 2)]).toEqual([[12, 22, 32], [14, 24, 34]]);
    // average: first pixel = floor(up / 2) + 6 = 12; second = floor((left 12 + up 14) / 2) + 26 = 39
    expect([pixel(0, 3), pixel(1, 3)]).toEqual([[12, 22, 32], [39, 49, 59]]);
    // paeth: first pixel predicts up (12) + 1; second: left 13, up 39, up-left 12 -> p = 40, closest is up (39) + 1
    expect(pixel(0, 4)).toEqual([13, 23, 33]);
    expect(pixel(1, 4)).toEqual([40, 50, 60]);
  });

  it('reads RGBA images', () => {
    const image = decodePng(png(1, 1, 6, [[0, 1, 2, 3, 4]]));
    expect(image.channels).toBe(4);
    expect(Array.from(image.pixels)).toEqual([1, 2, 3, 4]);
  });

  it('rejects data that is not a PNG it can read', () => {
    expect(() => decodePng(Buffer.from('not a png at all, just text here'))).toThrow();
    expect(() => decodePng(png(1, 1, 3, [[0, 1]]))).toThrow('unsupported');
    expect(() => decodePng(png(1, 1, 2, [[0, 1, 2, 3]], 1))).toThrow('unsupported');
    expect(() => decodePng(png(1, 1, 2, [[9, 1, 2, 3]]))).toThrow('bad PNG filter');
  });
});
