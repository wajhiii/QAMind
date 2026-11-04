/**
 * Draws the plugin icon (a magnifying glass with a check mark on a rounded square) into hosts/claude/icon.png, with no image library:
 * shapes are measured as distances to anti-alias their edges, and the PNG is written by hand.
 *   node scripts/make-icon.ts
 * The build copies the file into the plugin (`plugins/qamind/.claude-plugin/icon.png`); commit the result.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const SIZE = 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "hosts", "claude", "icon.png");

type Rgb = [number, number, number];
const BACK_TOP: Rgb = [49, 46, 129];
const BACK_BOTTOM: Rgb = [79, 70, 229];
const WHITE: Rgb = [255, 255, 255];
const GREEN: Rgb = [52, 211, 153];

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
/** Share of a pixel covered by a shape, from its signed distance (negative inside) in pixels. */
const cover = (d: number): number => clamp(0.5 - d);
const segment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const roundedSquare = (px: number, py: number, half: number, radius: number): number => {
  const qx = Math.abs(px - SIZE / 2) - (half - radius);
  const qy = Math.abs(py - SIZE / 2) - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

const lens = { x: 450, y: 450, r: 250, ring: 62 };
const handle = { ax: 640, ay: 640, bx: 805, by: 805, width: 62 };
const check = { a: [338, 455], b: [425, 543], c: [575, 365], width: 58 } as const;

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const shape = cover(roundedSquare(px, py, SIZE / 2, 230));
    const k = py / SIZE;
    let color: Rgb = [0, 1, 2].map((i) => BACK_TOP[i]! + (BACK_BOTTOM[i]! - BACK_TOP[i]!) * k) as Rgb;
    const mix = (c: Rgb, amount: number): void => {
      color = [0, 1, 2].map((i) => color[i]! + (c[i]! - color[i]!) * amount) as Rgb;
    };
    mix(WHITE, cover(Math.abs(Math.hypot(px - lens.x, py - lens.y) - lens.r) - lens.ring / 2));
    mix(WHITE, cover(segment(px, py, handle.ax, handle.ay, handle.bx, handle.by) - handle.width / 2));
    const stroke = Math.min(segment(px, py, check.a[0], check.a[1], check.b[0], check.b[1]), segment(px, py, check.b[0], check.b[1], check.c[0], check.c[1]));
    mix(GREEN, cover(stroke - check.width / 2));
    const i = (y * SIZE + x) * 4;
    pixels[i] = Math.round(color[0]);
    pixels[i + 1] = Math.round(color[1]);
    pixels[i + 2] = Math.round(color[2]);
    pixels[i + 3] = Math.round(shape * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8);
const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) pixels.copy(rows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log(`Wrote ${path.relative(path.join(here, ".."), out)} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(0)} KB).`);
