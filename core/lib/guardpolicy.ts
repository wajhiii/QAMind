import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./fsutil.ts";
import { findActiveMarkers } from "./run.ts";
import type { RunMarker } from "./run.ts";
import { isRequestAllowed } from "./urlpolicy.ts";
import type { RunPolicy } from "./urlpolicy.ts";

/** Hosts the browser itself talks to in the background; not worth reporting as blocked page traffic. */
const BROWSER_INTERNAL =
  /^(update\.googleapis\.com|accounts\.google\.com|content-autofill\.googleapis\.com|optimizationguide-pa\.googleapis\.com|safebrowsing\.googleapis\.com|clients\d?\.google\.com|clientservices\.googleapis\.com|www\.google\.com|www\.gstatic\.com|edgedl\.me\.gvt1\.com|redirector\.gvt1\.com|android\.clients\.google\.com)$/i;

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  internal: boolean;
}

/** Union of every active run's policy. Deny wins, and with no active run nothing is allowed (fail closed). */
export function mergedPolicy(markers: RunMarker[]): RunPolicy {
  return {
    allowed_origins: [...new Set(markers.flatMap((m) => m.policy.allowed_origins))],
    blocked_patterns: [...new Set(markers.flatMap((m) => m.policy.blocked_patterns))],
  };
}

export function decide(url: string, markers: RunMarker[]): GuardDecision {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* handled by isRequestAllowed */
  }
  const internal = BROWSER_INTERNAL.test(host);
  if (markers.length === 0) return { allowed: false, reason: "no QAMind run is active, so the test browser is locked", internal };
  const r = isRequestAllowed(mergedPolicy(markers), url);
  return { allowed: r.allowed, reason: r.reason, internal };
}

export interface BlockedEntry {
  ts: string;
  run_id: string;
  method: string;
  url: string;
  reason: string;
}

export function logBlocked(home: string, markers: RunMarker[], entry: Omit<BlockedEntry, "run_id" | "ts">): void {
  const targets = markers.length ? markers.map((m) => ({ file: path.join(m.store, "state", "guard-blocked.jsonl"), run_id: m.run_id })) : [{ file: path.join(home, "state", "guard-blocked.jsonl"), run_id: "none" }];
  for (const t of targets) {
    try {
      ensureDir(path.dirname(t.file));
      fs.appendFileSync(t.file, JSON.stringify({ ts: new Date().toISOString(), run_id: t.run_id, ...entry }) + "\n", "utf8");
    } catch {
      /* logging must never break browsing */
    }
  }
}

export function readBlocked(store: string, runId: string): BlockedEntry[] {
  const file = path.join(store, "state", "guard-blocked.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BlockedEntry)
    .filter((e) => e.run_id === runId);
}

/** A tiny cache so the proxy re-reads markers at most every second or so but still reacts to a run starting or ending. */
export function markerSource(home: string, ttlMs = 1000): () => RunMarker[] {
  let at = 0;
  let cached: RunMarker[] = [];
  return () => {
    const now = Date.now();
    if (now - at > ttlMs) {
      cached = findActiveMarkers(home);
      at = now;
    }
    return cached;
  };
}
