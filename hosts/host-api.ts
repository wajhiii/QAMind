/**
 * What a host adapter is (spec 5.1). An adapter describes a host; it never touches the host's files itself. It answers two questions:
 *   render(): what runtime files does this host need (the skills and shared documents, with this host's names and wording)?
 *   plan():   which edits make the host use them (skill files, MCP registration, hooks, a rules or AGENTS.md section)?
 * The setup CLI applies, verifies and reverses the plan the same way for every host (idempotent, backed up, only what it created), so a new host is a
 * folder `hosts/<id>/` with a `host.json` and an `adapter.ts`, and nothing in core changes.
 */
export type Tier = "full" | "experimental" | "instruction-only";

export interface HostJson {
  id: string;
  name: string;
  tier: Tier;
  /** What the README and `qamind status` say about enforcement on this host, in plain words. */
  auto_qa: {
    mode: "enforced" | "advisory";
    /** Hook input/output description, see core/auto-qa/hostio.ts. Absent: no hooks. */
    hooks?: unknown;
    /** How the gate tells the agent to run the internal QA skill, with `{mode}`. */
    invoke?: string;
    /** Environment variables the host sets for its hook processes (value `{cwd}` = the project folder). The conformance suite sets them the same way. */
    hook_env?: Record<string, string>;
    /** Example hook payloads in this host's documented format (`{session}`, `{cwd}`, `{prompt}` are filled in): `prompt`, `stop`, `stop_after_block`, `stop_aborted`. */
    samples?: Record<string, unknown>;
  };
  safety: "hooks" | "instructions";
  /** Where it can be installed. Default: both. (A host with no project-level files lists only "user"; one with no user-level place lists only "project".) */
  scopes?: Array<"user" | "project">;
  commands: Record<string, string>;
  skills?: {
    /** Skill folders are named `<prefix><core name>` (a host without plugin namespaces keeps names unique this way). */
    name_prefix?: string;
    /** `folders`: `<name>/SKILL.md` with front matter. `flat`: one Markdown procedure per skill, no front matter. */
    layout?: "folders" | "flat";
    /** The core front matter fields this host understands; the rest are dropped. */
    fields?: string[];
    /** Extra front matter per core skill name. */
    frontmatter?: Record<string, Record<string, string | boolean>>;
  };
  [extra: string]: unknown;
}

export interface HostContext {
  /** The QAMind checkout (the install folder). */
  repoRoot: string;
  /** Where this host's rendered runtime lives: `core/`, `skills/`, `dist/` and `host.json`. */
  runtimeDir: string;
  /** The operating-system user's home (injected by tests; HOME or USERPROFILE otherwise). */
  userHome: string;
  scope: "user" | "project";
  /** The project folder: where a project-level install goes, and what an AGENTS.md section is written into. */
  projectDir: string;
  version: string;
  env: NodeJS.ProcessEnv;
  /** The QAMind user store, for notes that mention it. */
  home: string;
}

/** One edit to a host's files. The engine knows how to apply, verify and reverse each kind. */
export type OpKind = "skill" | "mcp" | "hook" | "rules" | "instructions" | "plugin" | "launcher" | "other";

export type Op = (
  | { op: "file"; path: string; content: string; mode?: number }
  | { op: "json"; path: string; keyPath: string[]; value: unknown; arrayMatch?: { field: string; equals: string } }
  | { op: "block"; path: string; id: string; text: string; syntax: "html" | "hash" }
  | { op: "command"; run: string[]; check?: string[]; /** The check passes only if its output contains this text (a listing command that exits 0 either way). */ checkOutputIncludes?: string; undo?: string[]; label: string }
) & {
  /** What this edit is for, so `status` can say "skills 5 of 5, MCP 2 of 2, hooks 2 of 2" for any host. */
  kind?: OpKind;
};

export interface McpRegistration {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface HostAdapter {
  id: string;
  /** Is the host itself on this machine? A note, never a gate: setup writes the files either way and says so. */
  detect(ctx: HostContext): { found: boolean; version?: string; note?: string };
  /** The placeholders this host's skills and shared documents are rendered with (see core/skills). */
  placeholders(ctx: HostContext, host: HostJson): Record<string, string>;
  /** The edits that install this host, from the rendered runtime. */
  plan(ctx: HostContext, host: HostJson): Op[];
  /** The shell commands this host runs for the two auto-QA hook events, as installed. Absent for a host with no hooks (auto-QA is then advisory). */
  hookCommands?(ctx: HostContext, host: HostJson): { stop?: string; prompt?: string };
  /** The MCP servers as this host would start them, read back from its config (conformance starts exactly these). */
  mcpRegistrations(ctx: HostContext, host: HostJson): McpRegistration[];
  /** Absolute paths of the skill files this install makes discoverable, with the name each is invoked by. */
  skills(ctx: HostContext, host: HostJson): Array<{ name: string; file: string }>;
  /** Lines to print after setup: what to do by hand, what could not be done. */
  notes(ctx: HostContext, host: HostJson): string[];
}

export interface LoadedHost {
  id: string;
  dir: string;
  json: HostJson;
  adapter: HostAdapter;
}
