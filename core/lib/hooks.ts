import path from "node:path";
import { compileRules, protectedReason, relativeToRoot } from "./fix/protect.ts";
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

  const roots = allowedWriteRoots(marker, home, tmpDirs);

  // The browser tool saves a `filename` itself, and a relative name is resolved against the project folder (the workspace root), so a bare "page.png" would litter the project.
  // Evidence belongs in the run folder, in every run mode: a fix run must not find stray files in its tree either.
  if (tool.startsWith("mcp__plugin_qamind_browser__")) {
    const name = ti["filename"];
    if (typeof name === "string" && name.trim() !== "" && !roots.some((r) => inside(path.resolve(marker.project_root, name), r))) {
      return { decision: "deny", reason: `The browser tool would save "${name}" in the project folder. Save evidence inside the run folder with an absolute path, for example ${path.join(marker.run_dir, "screenshots", "<slug>.png")}, so the project stays untouched.` };
    }
  }

  if (!marker.readonly) return marker.kind === "qa" ? decideFixRun(marker, tool, ti, abs, home, tmpDirs) : null;

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

// ---- fix runs (`/qa`): edits are allowed inside the project, but never to protected files, and git/dependency changes go through the fix tools ----

/** Every git command that changes anything. Reading (status, diff, log, show, blame, ls-files, rev-parse) stays allowed. */
const GIT_WRITE = /\bgit\s+(?:(?:-[A-Za-z]\s+\S+|--[a-z-]+(?:=\S+)?)\s+)*(add|commit|push|pull|fetch|merge|rebase|reset|checkout|switch|restore|stash|cherry-pick|revert|rm|mv|clean|tag|apply|am|worktree|remote|config|submodule|filter-branch|gc|prune|reflog|update-ref|init|clone|bisect)\b/;
const GIT_BRANCH_WRITE = /\bgit\s+branch\s+(?!(?:--list|-a|-r|-v|-vv|--show-current|--contains|--merged|--no-merged)\b)\S/;
const GIT_HOST_CLI = /(^|[;&|\s])gh\s+\S/;
const FILE_COMMANDS = new Set(["rm", "mv", "cp", "tee", "truncate", "ln", "install", "dd", "chmod", "chown"]);

/** The words of each simple command in a line, without quotes: enough to see which files rm, mv, cp and tee were given. */
function commandWords(cmd: string): string[][] {
  return cmd
    .split(/&&|\|\||;|\||\n/)
    .map((seg) => [...seg.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? ""))
    .filter((w) => w.length > 0);
}

function decideFixRun(marker: RunMarker, tool: string, ti: Record<string, unknown>, abs: (p: string) => string, home: string, tmpDirs: string[]): Decision | null {
  const rules = compileRules(marker.fix?.do_not_touch ?? []);
  const outsideOk = [home, ...tmpDirs];
  const why = (target: string): string | undefined => {
    const p = abs(target);
    const rel = relativeToRoot(marker.project_root, p);
    if (rel === undefined) return outsideOk.some((r) => inside(p, r)) ? undefined : `${target} is outside the project: a fix may change files only inside ${marker.project_root}.`;
    return protectedReason(rel, rules);
  };
  const fixOnly = "This is a fix run (/qa): git and dependency changes are made by the fix tools (fix_create_branch, fix_commit, fix_revert), which enforce the rules";

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const target = String(ti["file_path"] ?? ti["notebook_path"] ?? "");
    const problem = target ? why(target) : undefined;
    if (problem) return { decision: "deny", reason: `${problem} A fix must not touch it. If the finding really lives there, leave it in the report for a person to decide.` };
  }
  if (tool === "Bash") {
    const cmd = String(ti["command"] ?? "");
    const unquoted = stripQuoted(cmd);
    if (GIT_WRITE.test(unquoted) || GIT_BRANCH_WRITE.test(unquoted)) return { decision: "deny", reason: `${fixOnly}; this command would change git state or its settings. QAMind never pushes, merges, resets or opens a pull request.` };
    if (GIT_HOST_CLI.test(unquoted)) return { decision: "deny", reason: "QAMind never talks to the git host (no pull requests, releases or API calls from a fix run)." };
    if (INSTALLS.test(cmd)) return { decision: "deny", reason: "A fix run does not change dependencies (installs, updates and removals are blocked)." };
    if (IN_PLACE_EDIT.test(cmd)) return { decision: "deny", reason: "Edit files with the Edit tool, not in place from the shell: the safety checks look at the file paths the edit tools are given." };
    for (const m of [...unquoted.matchAll(REDIRECT), ...unquoted.matchAll(AMP_REDIRECT)]) {
      const raw = (m[1] ?? "").replace(/^["']|["']$/g, "");
      if (!raw || raw === "/dev/null" || raw.startsWith("&") || raw === "/dev/stderr" || raw === "/dev/stdout") continue;
      const problem = why(raw);
      if (problem) return { decision: "deny", reason: `This command writes to ${raw}: ${problem}` };
    }
    for (const words of commandWords(cmd)) {
      if (!FILE_COMMANDS.has(path.basename(words[0] ?? ""))) continue;
      for (const w of words.slice(1)) {
        if (!w || w.startsWith("-") || /^[\d.]+$/.test(w) || /^[ugoa]*[+=-][rwxX]+$/.test(w)) continue;
        const problem = why(w);
        if (problem) return { decision: "deny", reason: `\`${words[0]}\` would change ${w}: ${problem}` };
      }
    }
  }
  return null;
}

export function toHookOutput(d: Decision): unknown {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.decision, permissionDecisionReason: d.reason } };
}
