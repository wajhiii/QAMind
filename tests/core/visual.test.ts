import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { test } from "node:test";
import { decodePng, encodePng } from "../../core/lib/sweep/png.ts";
import type { Image } from "../../core/lib/sweep/png.ts";
import { acceptBaseline, baselineSummary, compareImages, compareWithBaseline, findBaseline } from "../../core/lib/sweep/visual.ts";
import { tmp } from "./helpers.ts";

// Visual regression (spec 13.9): the PNG reader and writer, the comparison with its tolerance and threshold, and the baseline store.

function solid(w: number, h: number, rgb: [number, number, number] = [255, 255, 255]): Image {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { width: w, height: h, data };
}
function paint(img: Image, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]): Image {
  const data = Uint8Array.from(img.data);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([...rgb, 255], (y * img.width + x) * 4);
  return { ...img, data };
}

/** A PNG written by hand with the given scanline filter, to prove the reader undoes every kind a browser or another encoder may use. */
function pngWithFilter(img: Image, filter: 0 | 1 | 2 | 3 | 4): Buffer {
  const bpp = 4;
  const stride = img.width * bpp;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const cur = img.data[y * stride + x] as number;
      const a = x >= bpp ? (img.data[y * stride + x - bpp] as number) : 0;
      const b = y > 0 ? (img.data[(y - 1) * stride + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (img.data[(y - 1) * stride + x - bpp] as number) : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth;
      raw[y * (stride + 1) + 1 + x] = (cur - pred) & 0xff;
    }
  }
  const enc = encodePng({ width: 1, height: 1, data: new Uint8Array(4) });
  const chunks = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, "latin1"), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([enc.subarray(0, 8), chunks("IHDR", ihdr), chunks("IDAT", zlib.deflateSync(raw)), chunks("IEND", Buffer.alloc(0))]);
}

test("a PNG survives write and read, and the reader undoes every scanline filter", () => {
  let img = solid(9, 7, [10, 20, 30]);
  img = paint(img, 2, 1, 4, 3, [200, 100, 50]);
  img = paint(img, 0, 5, 9, 2, [0, 255, 128]);
  const back = decodePng(encodePng(img));
  assert.equal(back.width, 9);
  assert.equal(back.height, 7);
  assert.deepEqual([...back.data], [...img.data]);
  for (const f of [0, 1, 2, 3, 4] as const) assert.deepEqual([...decodePng(pngWithFilter(img, f)).data], [...img.data], `filter ${f}`);
  assert.throws(() => decodePng(Buffer.from("not a png at all, just text that is long enough to pass a length check")), /not a PNG/);
});

test("identical pictures do not differ; a change below the tolerance (font smoothing) is not a change; a change above the threshold is", () => {
  const a = paint(solid(100, 100), 10, 10, 20, 20, [30, 30, 30]);
  assert.equal(compareImages(a, a, 0.2).differs, false);
  assert.equal(compareImages(a, a, 0.2).changed_pixels, 0);

  const smoothed = paint(a, 10, 10, 20, 20, [45, 45, 45]); // 15 off on every channel: under the tolerance of 24
  assert.equal(compareImages(a, smoothed, 0).changed_pixels, 0);

  const moved = paint(a, 50, 50, 10, 10, [220, 20, 20]); // 100 of 10000 pixels = 1%
  const d = compareImages(a, moved, 0.2);
  assert.equal(d.differs, true);
  assert.equal(d.percent, 1);
  assert.deepEqual(d.region, { x: 50, y: 50, width: 10, height: 10 });
  assert.equal(d.impact, "minor");
  assert.ok(d.diff, "a picture of the difference is produced");
  const at = (x: number, y: number): number[] => [...(d.diff as Image).data.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 3)];
  assert.deepEqual(at(55, 55), [220, 30, 30], "changed pixels are red");
  assert.ok((at(1, 1)[0] as number) > 250, "unchanged pixels are the baseline faded toward white");

  assert.equal(compareImages(a, moved, 1).differs, false, "exactly at the threshold is not above it");
  assert.equal(compareImages(a, moved, 1.5).differs, false);
  assert.equal(compareImages(a, paint(a, 0, 0, 100, 30, [0, 0, 0]), 0.2).impact, "layout", "a large share of the picture is a layout change");
});

test("a page that got taller or wider differs, and the part that exists in only one picture counts", () => {
  const base = solid(100, 100);
  const taller = solid(100, 160);
  const d = compareImages(base, taller, 0.2);
  assert.equal(d.size_changed, true);
  assert.equal(d.differs, true);
  assert.equal(d.impact, "layout");
  assert.deepEqual(d.region, { x: 0, y: 100, width: 100, height: 60 });
  assert.equal(d.changed_pixels, 100 * 60);
  assert.equal((d.diff as Image).height, 160);
});

test("baselines: accept per page, role, browser and screen size; a later picture is compared with it, and a new accept replaces it", () => {
  const store = tmp("qamind-store-");
  const shots = tmp("qamind-shots-");
  const write = (name: string, img: Image): string => {
    const f = path.join(shots, name);
    fs.writeFileSync(f, encodePng(img));
    return f;
  };
  const good = solid(60, 40, [250, 250, 250]);
  const key = { page: "my-orders", role: "acme-1", browser: "chromium", viewport: "mobile" };
  assert.equal(findBaseline(store, key), undefined);
  assert.equal(compareWithBaseline(store, key, write("good.png", good), path.join(shots, "diff.png"), 0.2).state, "no-baseline");

  const entry = acceptBaseline(store, key, write("good.png", good), "run-1", new Date("2026-11-01T10:00:00Z"), "owner");
  assert.equal(entry.width, 60);
  assert.equal(entry.accepted_run, "run-1");
  assert.deepEqual(baselineSummary(store).pages, ["my-orders"]);
  assert.equal(findBaseline(store, { ...key, viewport: "desktop" }), undefined, "another screen size has no baseline");
  assert.equal(findBaseline(store, { ...key, browser: "webkit" }), undefined, "another browser has none either");

  const same = compareWithBaseline(store, key, write("same.png", good), path.join(shots, "diff-same.png"), 0.2);
  assert.equal(same.state, "same");
  assert.equal(fs.existsSync(path.join(shots, "diff-same.png")), false, "no difference picture when nothing differs");

  const changed = paint(good, 0, 0, 60, 20, [10, 10, 200]);
  const cmp = compareWithBaseline(store, key, write("changed.png", changed), path.join(shots, "out", "diff.png"), 0.2);
  assert.equal(cmp.state, "different");
  assert.ok(fs.existsSync(path.join(shots, "out", "diff.png")));
  assert.equal(decodePng(fs.readFileSync(path.join(shots, "out", "diff.png"))).width, 60);

  acceptBaseline(store, key, write("changed.png", changed), "run-2", new Date("2026-11-02T10:00:00Z"));
  assert.equal(baselineSummary(store).count, 1, "accepting again replaces the picture, it does not add one");
  assert.equal(compareWithBaseline(store, key, write("changed.png", changed), path.join(shots, "d3.png"), 0.2).state, "same");
});
