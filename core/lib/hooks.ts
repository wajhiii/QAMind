import path from "node:path";
import { findActiveMarkers } from "./run.ts";
import type { RunMarker } from "./run.ts";

export interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface Decision {
  decision: "deny";
  reason: string;
}

const GIT_MUTATION = /\bgit\s+(?:-[A-Za-z]\s+\S+\s+)*(add|commit|push|pull|fetch\s+--prune|merge|rebase|reset|checkout|switch|restore|stash|cherry-pick|revert|rm|mv|clean|tag|apply|am|worktree|branch\s+-[dDmM])\b/;
const INSTALLS = /\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|ci)\b|\bpip3?\s+install\b|\bcomposer\s+(install|require|update|remove)\b|\bbundle\s+(install|update)\b|\bdotnet\s+add\b/;
const IN_PLACE_EDIT = /\bsed\s+(?:-[A-Za-z]*i|--in-place)\b|\bperl\s+-[A-Za-z]*i\b/;
/** `>` or `>>` that is a shell redirect: not `2>&1`, `>&`, `=>`, `>=`, or `->`. Quoted text is removed first. */
const REDIRECT = /(?:^|[^0-9&>=<-])>{1,2}(?![=>&|])\s*([^\s&|;)]+)/g;
const AMP_REDIRECT = /&>{1,2}\s*([^\s&|;)]+)/g;
const stripQuoted = (cmd: string): string => cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
const CREDENTIAL_FILE = /(^|[\\/\s"'=])\.env\.qa(?![.\w-])/;

function inside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function allowedWriteRoots(marker: RunMarker, home: string, tmpDirs: string[]): string[] {
  return [path.join(marker.project_root, ".qa"), home, ...tmpDirs];
}

/**
 * Safety guard for an active QAMind run in this session (spec §9.2, §12). It only acts while a run marker for
 * this session exists, so it is a no-op in every other session. On Claude Code this enforces what other hosts
 * can only ask for in instructions. Bash inspection is best-effort, not a sandbox.
 */
export function decidePreToolUse(input: PreToolUseInput, home: string, tmpDirs: string[] = [], now = new Date()): Decision | null {
  if (!input.session_id) return null;
  const marker = findActiveMarkers(home, now).find((m) => m.session_id === input.session_id);
  if (!marker) return null;
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  const cwd = input.cwd ?? marker.project_root;
  const abs = (p: string) => path.resolve(cwd, p);

  // Credentials are never read into the conversation, in any run mode.
  if (tool === "Read" || tool === "Grep" || tool === "Glob") {
    const target = String(ti["file_path"] ?? ti["path"] ?? ti["pattern"] ?? "");
    if (CREDENTIAL_FILE.test(`/${target}`) || path.basename(target) === ".env.qa") {
      return { decision: "deny", reason: "QAMind never reads .env.qa: credentials must not enter the conversation. Use the secret names in the roles table (the browser tool and the qamind CLI substitute the values)." };
    }
  }
  if (tool === "mcp__plugin_qamind_browser__browser_run_code_unsafe") {
    return { decision: "deny", reason: "browser_run_code_unsafe runs arbitrary code in the browser tool's process, which holds the test credentials. Use the regular browser tools instead." };
  }

  if (tool === "Bash") {
    const cmd = String(ti["command"] ?? "");
    if (CREDENTIAL_FILE.test(cmd) && !/\.env\.qa\.example/.test(cmd.replace(/\.env\.qa(?!\.example)/g, "X.env.qa"))) {
      return { decision: "deny", reason: "Commands that touch .env.qa are blocked during a QAMind run: credentials must never be printed or copied." };
    }
    if (/^\s*(printenv|env|export\s+-p|set)\s*(\||$)/.test(cmd)) return { decision: "deny", reason: "Dumping the environment could print test credentials, so it is blocked during a QAMind run." };
  }

  if (!marker.readonly) return null;

  const roots = allowedWriteRoots(marker, home, tmpDirs);
  const writable = (p: string) => roots.some((r) => inside(abs(p), r));
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const target = String(ti["file_path"] ?? ti["notebook_path"] ?? "");
    if (target && !writable(target)) {
      return { decision: "deny", reason: `This is a report-only QA run (${marker.kind}): it may write only inside .qa/ and the QAMind user store, not ${target}. Put the proposal in the report instead.` };
    }
  }
  if (tool === "Bash") {
    const cmd = String(ti["command"] ?? "");
    const reportOnly = `This is a report-only QA run (${marker.kind}), so this command is blocked`;
    if (GIT_MUTATION.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it would change git state.` };
    if (INSTALLS.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it would change dependencies.` };
    if (IN_PLACE_EDIT.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it edits files in place.` };
    const unquoted = stripQuoted(cmd);
    for (const m of [...unquoted.matchAll(REDIRECT), ...unquoted.matchAll(AMP_REDIRECT)]) {
      const raw = (m[1] ?? "").replace(/^["']|["']$/g, "");
      if (!raw || raw === "/dev/null" || raw.startsWith("&") || raw === "/dev/stderr" || raw === "/dev/stdout") continue;
      if (!writable(raw)) return { decision: "deny", reason: `${reportOnly}: it writes to ${raw}, outside .qa/ and the QAMind user store.` };
    }
  }
  return null;
}

export function toHookOutput(d: Decision): unknown {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.decision, permissionDecisionReason: d.reason } };
}
