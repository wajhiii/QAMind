import path from "node:path";
import { readJson } from "../fsutil.ts";

/** What a sweep found, as the run folder records it (`data/sweep.json`) and the reports read it. */

export const SIGNAL_KINDS = [
  "console-error",
  "page-error",
  "failed-request",
  "http-error",
  "bad-text",
  "scrolls-sideways",
  "control-offscreen",
  "covered-element",
  "broken-image",
  "unnamed-control",
  "image-missing-alt",
  "clipped-text",
  "rtl-in-ltr",
  "never-settled",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface Signal {
  kind: SignalKind;
  /** One sentence a developer can act on, masked. */
  detail: string;
  /** What makes two signals the same problem on different browsers and screen sizes (the kind and the thing, never numbers that differ by window). */
  key: string;
}

export interface VisualResult {
  state: "no-baseline" | "same" | "different";
  /** Percent of pixels that differ. */
  percent?: number;
  impact?: "none" | "minor" | "layout";
  region?: { x: number; y: number; width: number; height: number } | null;
  size_changed?: boolean;
  baseline_run?: string;
  baseline_at?: string;
  /** Evidence files, relative to the run folder: the baseline as it was, this run's picture, and the picture of the difference. */
  before?: string;
  after?: string;
  diff?: string;
}

export interface Visit {
  page: string;
  title: string;
  ui: string;
  role?: string;
  browser: string;
  viewport: string;
  width: number;
  height: number;
  /** The address visited (query values removed). */
  url: string;
  status?: number;
  /** Milliseconds from the start of the navigation until the network went quiet: when the page is ready for a person. */
  settled_ms?: number;
  /** The browser's own timings, where it gives them. */
  load_ms?: number;
  ttfb_ms?: number;
  fcp_ms?: number;
  lcp_ms?: number;
  cls?: number;
  requests: number;
  /** Requests the run's URL policy refused during the visit (addresses outside the test environment). */
  blocked?: number;
  screenshot?: string;
  signals: Signal[];
  visual?: VisualResult;
  /** The page could not be visited: why. Nothing is concluded about it. */
  error?: string;
}

export interface PerfFinding {
  kind: "slow-page" | "regression";
  page: string;
  title: string;
  role?: string;
  browser: string;
  viewport: string;
  ms: number;
  budget_ms: number;
  previous_ms?: number;
  previous_at?: string;
  slower_pct?: number;
  /** A plain sentence for the report. */
  message: string;
}

export interface SignalGroup {
  page: string;
  title: string;
  kind: SignalKind;
  key: string;
  detail: string;
  seen_on: Array<{ browser: string; viewport: string }>;
  /** Where it happens, in words: "every browser and screen size", "only in webkit", "only at mobile", "only in webkit at mobile". */
  scope: string;
}

export interface SweepResults {
  schema_version: 1;
  run_id: string;
  ran_at: string;
  matrix: { browsers: string[]; viewports: Array<{ name: string; width: number; height: number }>; why: string };
  /** Browsers that could not start here, and why: they are Not tested, never passed. */
  unavailable: Array<{ browser: string; reason: string }>;
  /** Pages or combinations that were not visited and the reason (the time budget, a sign-in that failed). */
  skipped: Array<{ page?: string; role?: string; browser?: string; viewport?: string; reason: string }>;
  budget_reached?: boolean;
  visits: Visit[];
  groups: SignalGroup[];
  perf: PerfFinding[];
  visual_summary: { compared: number; different: number; no_baseline: number };
  notes: string[];
}

export const sweepResultsFile = (runDir: string): string => path.join(runDir, "data", "sweep.json");

export function readSweepResults(runDir: string): SweepResults | undefined {
  return readJson<SweepResults>(sweepResultsFile(runDir));
}

const norm = (s: string): string => s.replace(/\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

/** Groups identical signals across browsers and screen sizes, saying where each one happens (spec 13.10: "group identical findings"). */
export function groupSignals(visits: Visit[]): SignalGroup[] {
  const combosByPage = new Map<string, Set<string>>();
  for (const v of visits) {
    if (v.error) continue;
    const set = combosByPage.get(v.page) ?? new Set<string>();
    set.add(`${v.browser}|${v.viewport}`);
    combosByPage.set(v.page, set);
  }
  const groups = new Map<string, SignalGroup>();
  for (const v of visits) {
    if (v.error) continue;
    for (const s of v.signals) {
      const id = `${v.page}|${s.kind}|${norm(s.key)}`;
      const g = groups.get(id) ?? { page: v.page, title: v.title, kind: s.kind, key: s.key, detail: s.detail, seen_on: [], scope: "" };
      if (!g.seen_on.some((x) => x.browser === v.browser && x.viewport === v.viewport)) g.seen_on.push({ browser: v.browser, viewport: v.viewport });
      groups.set(id, g);
    }
  }
  for (const g of groups.values()) {
    const all = combosByPage.get(g.page) ?? new Set<string>();
    g.scope = describeScope(g.seen_on, [...all].map((c) => ({ browser: c.split("|")[0] as string, viewport: c.split("|")[1] as string })));
  }
  return [...groups.values()];
}

export function describeScope(seen: Array<{ browser: string; viewport: string }>, all: Array<{ browser: string; viewport: string }>): string {
  const bAll = [...new Set(all.map((c) => c.browser))];
  const vAll = [...new Set(all.map((c) => c.viewport))];
  const bSeen = [...new Set(seen.map((c) => c.browser))];
  const vSeen = [...new Set(seen.map((c) => c.viewport))];
  if (seen.length >= all.length) return all.length > 1 ? "every browser and screen size that was checked" : `${bSeen[0]} at ${vSeen[0]}`;
  const onlyBrowsers = bAll.length > 1 && bSeen.length < bAll.length ? `only in ${bSeen.join(" and ")}` : "";
  const onlyViewports = vAll.length > 1 && vSeen.length < vAll.length ? `only at ${vSeen.join(" and ")}` : "";
  return [onlyBrowsers, onlyViewports].filter(Boolean).join(" ") || seen.map((c) => `${c.browser} at ${c.viewport}`).join(", ");
}

/** Slow-page findings once per page and kind (the same page in four browsers and sizes is one problem), with the slowest measurement and where it was seen. */
export function groupPerf(perf: PerfFinding[]): Array<PerfFinding & { seen_on: string[] }> {
  const by = new Map<string, Array<PerfFinding>>();
  for (const p of perf) by.set(`${p.page}|${p.role ?? "-"}|${p.kind}`, [...(by.get(`${p.page}|${p.role ?? "-"}|${p.kind}`) ?? []), p]);
  return [...by.values()].map((list) => {
    const worst = [...list].sort((a, b) => b.ms - a.ms)[0] as PerfFinding;
    return { ...worst, seen_on: list.map((p) => `${p.browser} ${p.viewport}`) };
  });
}
