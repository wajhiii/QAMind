import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "../fsutil.ts";
import { decodePng, encodePng } from "./png.ts";
import type { Image } from "./png.ts";

/**
 * Visual regression (spec 13.9): baselines are screenshots saved after a run the owner marked good, and a later screenshot of the same page, role, browser and screen size is compared with the
 * baseline. A difference above the configured share of pixels is a finding, with the before, the after and a picture of what changed.
 */

/** A colour channel may differ by this much (of 255) before a pixel counts as different: anti-aliasing and font smoothing are not changes. */
const CHANNEL_TOLERANCE = 24;

export interface VisualDiff {
  differs: boolean;
  /** The share of pixels that differ, in percent. */
  percent: number;
  changed_pixels: number;
  total_pixels: number;
  baseline_size: { width: number; height: number };
  current_size: { width: number; height: number };
  size_changed: boolean;
  /** Where the changes are, in pixels of the current screenshot (null when nothing differs). */
  region: { x: number; y: number; width: number; height: number } | null;
  /** How serious it looks: a different size or a large share is a layout change; the rest a small shift. */
  impact: "none" | "minor" | "layout";
  diff?: Image;
}

/** Compares two screenshots. The diff picture shows the baseline faded, with every changed pixel in red. */
export function compareImages(baseline: Image, current: Image, thresholdPercent: number): VisualDiff {
  const w = Math.max(baseline.width, current.width);
  const h = Math.max(baseline.height, current.height);
  const diff = new Uint8Array(w * h * 4);
  let changed = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const inB = x < baseline.width && y < baseline.height;
      const inC = x < current.width && y < current.height;
      let different: boolean;
      if (inB && inC) {
        const bi = (y * baseline.width + x) * 4;
        const ci = (y * current.width + x) * 4;
        different =
          Math.abs((baseline.data[bi] as number) - (current.data[ci] as number)) > CHANNEL_TOLERANCE ||
          Math.abs((baseline.data[bi + 1] as number) - (current.data[ci + 1] as number)) > CHANNEL_TOLERANCE ||
          Math.abs((baseline.data[bi + 2] as number) - (current.data[ci + 2] as number)) > CHANNEL_TOLERANCE;
        if (!different) {
          // unchanged: the baseline, faded toward white
          for (let k = 0; k < 3; k++) diff[o + k] = Math.round(((baseline.data[bi + k] as number) + 255 * 3) / 4);
          diff[o + 3] = 255;
        }
      } else different = true; // present in only one of the two: the page got taller, shorter, wider or narrower
      if (different) {
        changed++;
        diff[o] = 220;
        diff[o + 1] = 30;
        diff[o + 2] = 30;
        diff[o + 3] = 255;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = w * h;
  const percent = total === 0 ? 0 : (changed / total) * 100;
  const sizeChanged = baseline.width !== current.width || baseline.height !== current.height;
  const differs = percent > thresholdPercent;
  const impact: VisualDiff["impact"] = !differs ? "none" : sizeChanged && Math.abs(baseline.height - current.height) > 40 ? "layout" : percent >= 8 ? "layout" : "minor";
  return {
    differs,
    percent: Math.round(percent * 100) / 100,
    changed_pixels: changed,
    total_pixels: total,
    baseline_size: { width: baseline.width, height: baseline.height },
    current_size: { width: current.width, height: current.height },
    size_changed: sizeChanged,
    region: changed === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    impact,
    ...(differs ? { diff: { width: w, height: h, data: diff } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------- the baseline store

export interface BaselineKey {
  page: string;
  role: string;
  browser: string;
  viewport: string;
}
export interface BaselineEntry extends BaselineKey {
  file: string;
  width: number;
  height: number;
  accepted_run: string;
  accepted_at: string;
  accepted_by?: string;
}
interface BaselineIndex {
  schema_version: 1;
  entries: Record<string, BaselineEntry>;
}

export const baselineKey = (k: BaselineKey): string => `${k.page}|${k.role}|${k.browser}|${k.viewport}`;
const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
export const baselinesDir = (store: string): string => path.join(store, "baselines");
const indexFile = (store: string): string => path.join(baselinesDir(store), "index.json");

export function loadBaselines(store: string): BaselineIndex {
  const idx = readJson<BaselineIndex>(indexFile(store));
  return idx && typeof idx === "object" && idx.entries ? idx : { schema_version: 1, entries: {} };
}

export function findBaseline(store: string, key: BaselineKey): { entry: BaselineEntry; file: string } | undefined {
  const entry = loadBaselines(store).entries[baselineKey(key)];
  if (!entry) return undefined;
  const file = path.join(baselinesDir(store), entry.file);
  return fs.existsSync(file) ? { entry, file } : undefined;
}

/** Saves a screenshot as the baseline for its page, role, browser and screen size (replacing the earlier one). The caller holds the store's lock. */
export function acceptBaseline(store: string, key: BaselineKey, screenshot: string, run: string, now: Date, by?: string): BaselineEntry {
  const img = decodePng(fs.readFileSync(screenshot));
  const idx = loadBaselines(store);
  const file = `${safe(key.page)}__${safe(key.role)}__${safe(key.browser)}__${safe(key.viewport)}.png`;
  ensureDir(baselinesDir(store));
  fs.copyFileSync(screenshot, path.join(baselinesDir(store), file));
  const entry: BaselineEntry = { ...key, file, width: img.width, height: img.height, accepted_run: run, accepted_at: now.toISOString(), ...(by ? { accepted_by: by } : {}) };
  idx.entries[baselineKey(key)] = entry;
  writeJson(indexFile(store), idx);
  return entry;
}

export function baselineSummary(store: string): { count: number; pages: string[]; entries: BaselineEntry[] } {
  const entries = Object.values(loadBaselines(store).entries);
  return { count: entries.length, pages: [...new Set(entries.map((e) => e.page))].sort(), entries };
}

/** Compares a screenshot file with its baseline and writes the diff picture next to it when it differs. */
export function compareWithBaseline(store: string, key: BaselineKey, screenshotFile: string, diffFile: string, thresholdPercent: number): { state: "no-baseline" } | { state: "same" | "different"; diff: Omit<VisualDiff, "diff">; baseline: BaselineEntry; baselineFile: string } {
  const found = findBaseline(store, key);
  if (!found) return { state: "no-baseline" };
  const result = compareImages(decodePng(fs.readFileSync(found.file)), decodePng(fs.readFileSync(screenshotFile)), thresholdPercent);
  const { diff, ...rest } = result;
  if (diff) {
    ensureDir(path.dirname(diffFile));
    fs.writeFileSync(diffFile, encodePng(diff));
  }
  return { state: result.differs ? "different" : "same", diff: rest, baseline: found.entry, baselineFile: found.file };
}
