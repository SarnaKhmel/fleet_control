import { inflateSync } from 'node:zlib';

// A minimal PNG decoder for elevation tiles: 8-bit RGB or RGBA, not interlaced (what Terrarium serves).
// Anything else is rejected rather than misread.

export interface RgbImage {
  width: number;
  height: number;
  /** Bytes per pixel: 3 (RGB) or 4 (RGBA). */
  channels: 3 | 4;
  /** Unfiltered pixel rows, `width * channels` bytes each. */
  pixels: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(data: Uint8Array): RgbImage {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < 33 || SIGNATURE.some((b, i) => buf[i] !== b)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 3;
  const idat: Buffer[] = [];
  for (let offset = 8; offset + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, color, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) throw new Error('unsupported PNG format');
      channels = color === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0 || idat.length === 0) throw new Error('incomplete PNG');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error('truncated PNG data');
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = out - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[out + i - channels] : 0;
      const b = y > 0 ? pixels[prev + i] : 0;
      const c = y > 0 && i >= channels ? pixels[prev + i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) throw new Error('bad PNG filter');
      pixels[out + i] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
