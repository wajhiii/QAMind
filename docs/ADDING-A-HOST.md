# Adding a host

A host is a coding tool QAMind can be installed into. Adding one means **one new folder, `hosts/<id>/`, and nothing else**: no change to `core/`, `cli/`, the other hosts or the build.
The conformance suite proves it with a made-up host that lives only in a temp folder (`tests/conformance/dummy-host.ts`): if the whole suite passes for it, nothing in core knows any host.

Codex is not built yet (the owner deferred it, 2026-11-02); it will be exactly this: a folder.

## 1. Read the host's current documentation first

Before writing anything, check the tool's **current** docs (not memory: they change) for these, and write down what you find with the date in `host.json`:

| Question | Where the answer goes |
|---|---|
| Where do skills (or commands, or rules) go, user level and project level? What are the naming rules and which front matter fields exist? | `skills` in `host.json`, `plan()` in the adapter |
| How are MCP servers registered (file, format, variables, working folder, tool approval)? | `mcp` in `host.json`, `plan()` and `mcpRegistrations()` |
| Which hook events exist, what does each get on stdin, and can a "finished" hook make the agent continue? | `auto_qa.hooks`, `hooks` in `host.json` |
| What rules or instructions file does it read (`AGENTS.md`, a rules folder)? | `plan()` |
| Can QAMind's safety guard be a hook without a risk of blocking the user's own work? | `safety` |

Anything the docs do not say is recorded as **not documented**, never guessed. The tier follows from what was verified, below.

## 2. The folder

```
hosts/<id>/
  host.json     the facts and declarations (below)
  adapter.ts    exports `adapter`: what to render and which edits to make (below)
  ...           templates the adapter needs (for example an AGENTS.md section)
```

### host.json

| Field | Meaning |
|---|---|
| `id`, `name` | `id` must equal the folder name. `name` is what the skills call the host ("working in Cursor"). |
| `tier` | `full`, `experimental` or `instruction-only` (section 5). |
| `scopes` | `["user", "project"]` (default), or just one if the host has no such place. |
| `skills` | `name_prefix` (a host with no plugin namespaces keeps names unique, for example `qamind-`), `layout` (`folders` or `flat`), `fields` (the core front matter fields the host understands), `frontmatter` (extra fields per core skill, for example `disable-model-invocation`). |
| `auto_qa.mode` | `enforced` (a hook blocks the agent from finishing and makes it continue) or `advisory` (an instruction asks it to). The README says which, per host. |
| `auto_qa.hooks` | How the host's hook JSON maps onto the gate (see `core/auto-qa/hostio.ts`): which fields hold the session, the project folder, the prompt; what a "loop" is (`loop_active_when`); which endings are checked (`only_when`); what to print to continue (`block_output` with `{reason}`); `notice_output` or `null`. This is data, not code. |
| `auto_qa.invoke` | The sentence that tells the agent to run the internal auto-QA skill, with `{mode}`. |
| `auto_qa.hook_env`, `auto_qa.samples` | The environment variables the host sets for hooks, and example payloads in the host's documented format (`prompt`, `stop`, `stop_after_block`, optionally `stop_aborted`; `{session}`, `{cwd}`, `{prompt}` are filled in). The conformance suite runs the hook commands with exactly these. |
| `safety` | `hooks` (the safety guard is a hook) or `instructions` (it is only asked for). Be honest: see the Cursor entry for why a guard that could block the user's own tool use is not installed. |
| `headless` | (optional, for `qamind ci`) how the host's CLI runs without a person: `command` (and `command_env`, a variable that overrides it), `args` with `{prompt}`, `{plugin}`, `{max_cost}`, `{mode}`, `model_args`, `invoke` (how a prompt invokes the QA skill, with `{mode}`), `auth_env_any` (any one in the environment means it can authenticate), `auth_secret` (the secret a CI job provides), `auth_hint`, `cost_field` (the field of its JSON result), `child_env_remove`, `ci_install` (`npm_package`, `version`, `label`), `facts` (what the docs said, with the date). Core reads it and names no host; see [CI.md](CI.md). |
| `commands` | The names the user types, as the host shows them: `CMD_QA`, `CMD_QA_ONLY`, `CMD_QA_AUTO`, `CMD_QA_MEMORY_REVIEW`, `CMD_QA_FEEDBACK`, `CMD_QA_TESTS`. |
| `requires_host` | `true` if the host installs things through its own CLI, so setup skips (with a note) when it is not there. |
| `runtime` | `false` if the host brings its own runtime (the Claude Code plugin does); default is that setup renders `build/<id>/`. |
| `docs_checked`, `verified` | What you read and when, and whether QAMind has ever run inside the real host. |

### adapter.ts

An adapter describes; it never writes the host's files itself. It exports `adapter` implementing `HostAdapter` (`hosts/host-api.ts`):

| Method | Answers |
|---|---|
| `detect(ctx)` | Is the tool on this machine? A note, not a gate (setup writes the files anyway unless `requires_host`). |
| `placeholders(ctx, host)` | The values of the placeholders below, for this host. |
| `plan(ctx, host)` | The edits that install it, as a list of operations. |
| `hookCommands(ctx, host)` | The shell commands the host runs for the two hook events (omit if there are no hooks: auto-QA is then advisory). |
| `mcpRegistrations(ctx, host)` | The MCP servers as this host would start them, read back from its config. |
| `skills(ctx, host)` | The skill files this install makes discoverable, and the name each is invoked by. |
| `notes(ctx, host)` | What the user must do by hand, and what could not be done. |

**Operations** (`Op`): `file` (a file QAMind owns), `json` (one key, or one list element found by a field, in a config other tools also use), `block` (a marked section in a text file the user owns, such as `AGENTS.md`),
`command` (ask the host's own CLI, with a check and an undo). The setup CLI applies, verifies and reverses them the same way for every host: idempotent, a backup before anything that was already there is overwritten, an edit the user changed
afterwards is left alone on uninstall, a config that is not valid JSON is never overwritten, and only folders setup created are removed. Give each op a `kind` (`skill`, `mcp`, `hook`, `rules`, `instructions`, `plugin`) so `qamind status` can report it.

**Placeholders.** The shared skills and documents in `core/` are written once with placeholders, and every host fills in the same list. These are all of them (a test fails if core uses one that is not listed here):

| Placeholder | What the host puts there |
|---|---|
| `{{HOST_NAME}}` | The tool's name, for "you are working in ...". |
| `{{HOST_ID}}` | The id the run records as its host. |
| `{{CLI}}` | The `qamind` command as the agent runs it (`qamind` when setup's launcher is on the PATH). |
| `{{CLI_FALLBACK}}` | The same command by full path, for when `qamind` is not found. |
| `{{CORE_PATH}}` | The absolute path of the rendered `core/` (shared documents and knowledge) in the runtime folder. |
| `{{ARGUMENTS}}` | How the skill receives what the user typed after its name (a substitution variable, or a sentence that says to read it from the message). |
| `{{SESSION_ARG}}` | The `session` argument of `run_start`, including its trailing comma and space, or nothing if the host gives a skill no session id. |
| `{{SESSION_FLAG}}` | The `--session ID ` flag of `qamind auto skipped`, or nothing. |
| `{{MEMORY_TOOLS}}` | How the qa-memory tools are named in prose. |
| `{{MEMORY_TOOLS_LOAD}}` | What to do before the first call (Claude Code loads MCP tools on demand; most hosts need nothing). |
| `{{FIX_TOOLS_LOAD}}` | The same, for the fix tools, with the note that `fix_create_branch` and `fix_continue` are the user's decisions. |
| `{{BROWSER_TOOLS}}` | How the browser tools are named in prose. |
| `{{CMD_QA}}`, `{{CMD_QA_ONLY}}`, `{{CMD_QA_AUTO}}`, `{{CMD_QA_MEMORY_REVIEW}}`, `{{CMD_QA_FEEDBACK}}`, `{{CMD_QA_TESTS}}` | The command names, from `host.json` `commands`. |

An unknown placeholder fails the build, so a host that forgets one finds out at once. Core never names a host, a host's command, tool or folder (a test checks the instructions and the runtime's messages).

## 3. Try it

```
qamind setup --host <id> --dry-run         what it would do, nothing changed
qamind setup --host <id>                   do it (into your real user account: use QAMIND_USER_HOME=/tmp/x to try it elsewhere)
qamind status                              what is in place, and what is not
qamind uninstall --host <id>               takes exactly that away
```

`QAMIND_USER_HOME` points the host's user-level folders somewhere else, `QAMIND_HOME` the QAMind store, and `QAMIND_BUILD_DIR` the rendered runtimes, so a trial never touches the real ones.

## 4. Conformance

`tests/conformance/hosts.test.ts` runs, for every folder in `hosts/` (and the dummy host), without any per-host test code:

1. setup installs, and a second run changes nothing;
2. status is accurate (ok, then the problem when something is removed, then ok again, then nothing after uninstall) and states the tier, how auto-QA works and how safety is enforced;
3. the MCP servers are registered, and the registered qa-memory command starts and answers over stdio with the right tools and finds the project;
4. every core skill is discoverable under a documented name, the files exist with valid front matter (name equal to its folder where the host requires it) and no unrendered placeholder;
5. a `/qa-only` run through the registered server produces valid reports and memory;
6. uninstall leaves no file QAMind added, restores what was there before, and leaves other tools' settings exactly as they were;
7. a project-level install lands in the project, not in the user's account, and goes away again;
8. auto-QA behaves as declared: enforced means the host's own hook commands, fed the host's own payloads, block once, never loop, honour `#noqa` and off, skip an aborted turn and survive garbage; advisory means no hooks, an instruction in the project and a status that says so.

`tests/conformance/interop.test.ts` runs a chain of real runs through every host's own registration against one store and one project and checks that each host sees what the others learned, the same project id, and the same approved lessons.
A host that needs its own CLI (Claude Code) is installed through that CLI into an isolated config folder when `CLAUDE_BIN` is set; those tests are skipped otherwise, and the skip is visible.

## 5. The tier is a fact, not an aim

| Tier | Meaning | What earns it |
|---|---|---|
| `full` | Everything the host supports, enforced by its hooks where it has them. | A **real end-to-end run on that host** passed, recorded in [HOSTS.md](HOSTS.md) with the date and the host's version. A test fails if any host other than Claude Code claims it. |
| `experimental` | Built from the host's current documentation and the conformance suite; never run inside the real host. | Conformance passes. State what was not verified, in `host.json` (`verified`) and in HOSTS.md. |
| `instruction-only` | The agent is given instructions and MCP servers; nothing is enforced. | Conformance passes. The README says so plainly. |

When you run a real end-to-end test on a new host, record the result in HOSTS.md (what you ran, what passed, what you could not see) and only then raise the tier.
