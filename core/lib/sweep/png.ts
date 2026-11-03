import zlib from "node:zlib";

/**
 * A small PNG reader and writer, so screenshots can be compared without a dependency: 8-bit, not interlaced (what browsers write), all colour types.
 * Pixels are handled as RGBA, four bytes each.
 */

export interface Image {
  width: number;
  height: number;
  /** width * height * 4 bytes, RGBA. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const MAX_PIXELS = 40_000_000; // a screenshot far taller than any real page is refused, not allocated

export function decodePng(buf: Buffer): Image {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = -1;
  let interlace = 0;
  let palette: Buffer | undefined;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8] as number;
      colour = body[9] as number;
      interlace = body[12] as number;
    } else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "IDAT") idat.push(Buffer.from(body));
    else if (type === "IEND") break;
  }
  const channels = CHANNELS[colour];
  if (!width || !height || channels === undefined) throw new Error("unsupported PNG header");
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth} (8 expected)`);
  if (interlace !== 0) throw new Error("interlaced PNG files are not supported");
  if (width * height > MAX_PIXELS) throw new Error("PNG is too large to compare");
  if (colour === 3 && !palette) throw new Error("PNG palette is missing");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("PNG data is truncated");
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (cur[x - channels] as number) : 0;
      const b = prev[x] as number;
      const c = x >= channels ? (prev[x - channels] as number) : 0;
      const v = line[x] as number;
      let r: number;
      switch (filter) {
        case 0:
          r = v;
          break;
        case 1:
          r = v + a;
          break;
        case 2:
          r = v + b;
          break;
        case 3:
          r = v + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      cur[x] = r & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * channels;
      if (colour === 6) {
        out[o] = cur[i] as number;
        out[o + 1] = cur[i + 1] as number;
        out[o + 2] = cur[i + 2] as number;
        out[o + 3] = cur[i + 3] as number;
      } else if (colour === 2) {
        out[o] = cur[i] as number;
        out[o + 1] = cur[i + 1] as number;
        out[o + 2] = cur[i + 2] as number;
        out[o + 3] = 255;
      } else if (colour === 0) {
        out[o] = out[o + 1] = out[o + 2] = cur[i] as number;
        out[o + 3] = 255;
      } else if (colour === 4) {
        out[o] = out[o + 1] = out[o + 2] = cur[i] as number;
        out[o + 3] = cur[i + 1] as number;
      } else {
        const idx = (cur[i] as number) * 3;
        out[o] = (palette as Buffer)[idx] ?? 0;
        out[o + 1] = (palette as Buffer)[idx + 1] ?? 0;
        out[o + 2] = (palette as Buffer)[idx + 2] ?? 0;
        out[o + 3] = 255;
      }
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, "latin1"), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng(img: Image): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}
