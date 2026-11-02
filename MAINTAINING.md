# Maintaining QAMind

## Set up

Node **22.18 or newer** is needed to build and test (TypeScript is run directly with Node's type stripping). The built
plugin runs on Node 20+.

```
npm ci
npm run typecheck      # tsc --noEmit, strict
npm test               # unit and integration tests
npm run build          # bundles the CLI and renders plugins/qamind/
npm run check:generated   # fails if plugins/qamind/ is out of date with core/ (CI runs this)
npm run validate       # claude plugin validate on the plugin and the marketplace (needs the claude CLI; set CLAUDE_BIN)
```

For local development also run `cd plugins/qamind && npm ci --ignore-scripts` once. A plugin loaded from a local path does not get
Claude Code's automatic dependency install, and without it the browser launcher falls back to `npx` (slower to start).
`plugins/qamind/node_modules` is git-ignored.

`plugins/qamind/` is **generated and committed** (Claude Code installs straight from the repository, so it cannot
build). Never edit it by hand: change `core/` or `hosts/claude/` and run `npm run build`.

## Layout

- `core/lib/`: host-agnostic runtime library (project identity, store, config, URL policy, run lifecycle, API plan and
  runner, report, hooks logic). `core/scripts/`: the browser launcher and guard proxy.
- `core/skills/`, `core/shared/`, `core/knowledge/`: the agent's instructions and expertise, written once with
  `{{PLACEHOLDERS}}` that each host adapter fills in.
- `hosts/<host>/`: a thin adapter plus `host.json`. `cli/src/`: the `qamind` command.
- `demo-app/`: fixture app with seeded bugs; `demo-app/SEEDED-BUGS.md` is the private answer key.

## Changing the browser tool

The version appears in three places that must agree: `hosts/claude/package.json`, `hosts/claude/package-lock.json`
(`cd hosts/claude && npm install --package-lock-only --ignore-scripts`), and `PLAYWRIGHT_MCP_VERSION` in
`core/scripts/browser-launcher.ts`. Re-run the guard tests and a demo run after bumping.

## Releasing

Releases are Git tags (`vX.Y.Z`); there is no npm package. Bump `version` in `package.json`, update `CHANGELOG.md`,
`npm run build`, run all checks above, commit, tag. Users on the marketplace get the version in `plugin.json`.

## Not verified yet

Windows (the code avoids POSIX-only APIs where it can, but nothing has been run there), and Linux outside CI. Check the CI results for Linux and macOS, and for the new Windows job, after each push; they are not visible from the environment the phases are built in.

## The qa-memory server

`core/mcp/qa-memory/tools.ts` defines the tools (zod schema, description, annotations, handler); `server.ts` registers them with the SDK; `core/mcp/servers.ts` is the one list of server and tool names that the adapter, the skill, the host's
pre-approval and the tests all check against. **To add or change a tool:** edit `tools.ts`, add the name to `QA_MEMORY_TOOLS`, mention it in `core/skills/qa-only/SKILL.md`, put the logic in `core/lib/memory/service.ts` (not in the tool),
then `npm run build` and `npm test`. The tests refuse a tool that is missing from the skill, has an unbounded text field or list, is not annotated, or is named in the instructions but does not exist; and they refuse an instruction that names a memory
command or memory file. Keep tool descriptions short and in terms of when to call the tool: they are what the model reads.

**Dependencies.** `@modelcontextprotocol/sdk` and `zod` are pinned exactly and bundled by esbuild (`dist/qa-memory.mjs`), so nothing is installed next to the plugin. Move a pin only after reading the release notes, choose a version at least two weeks old,
and run `npm test` plus the learning test. The build writes `THIRD-PARTY-NOTICES.md` from the bundle's input list and **fails if a bundled package is not under a permissive license** (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, BlueOak, CC0): ask the owner before adding such a dependency.

**Memory formats.** Changing a memory file's format means bumping `MEMORY_SCHEMA` in `core/lib/memory/store.ts` and adding a `Migration` to `core/lib/memory/migrate.ts` (per file kind; it must keep every field it does not list in `removes`). Test it the way `tests/core/memory-infra.test.ts` does.

**Windows and Linux.** The phases are built and tested on macOS only. `.github/workflows/ci.yml` runs the full suite on Linux and macOS, and a separate Windows job (allowed to fail until the owner promotes it) runs the memory, server, fix-loop and auto-QA tests. Read their results after each push.

## Fix mode (`/qa`)

The fix loop is in `core/lib/fix/` (`protect.ts`, `gitops.ts`, `testrun.ts`, `state.ts`, `loop.ts`), its tools in `core/mcp/qa-memory/fixtools.ts`, the hook rules in `core/lib/hooks.ts` (`decideFixRun`), and the agent's instructions in
`core/skills/qa/SKILL.md` and `core/shared/fix-loop.md`. The design and its limits are in [decision 0003](docs/decisions/0003-fix-mode.md).

- **What a fix may not touch** is `BUILT_IN_PROTECTED` in `protect.ts` (plus the project's `fix_policy.do_not_touch`). Adding an entry protects it in the hook, `fix_begin` and `fix_commit` at once; `tests/core/fix-protect.test.ts` and `fix-hook.test.ts` show how to test one. Removing an entry weakens a safety rule: ask the owner.
- **The skill and `/qa-only` share Steps 1 to 5 word for word**; a test (`skills-use-tools.test.ts`) fails if they drift. Change the shared steps in both.
- **A rule that can be checked in code goes in the tools, not the skill text.** Add the check to `loop.ts`, make the tool return a `problem` and a `message` that says what to do, and add a case to `tests/core/fix-loop.test.ts` (it uses a real git repository with real bugs).
- **Two tools are deliberately not pre-approved** (`FIX_CONSENT_TOOLS` in `core/mcp/servers.ts`), so the host asks the user. Do not add them to a skill's allowed tools.
- **The fix test on the demo app** (spec section 14): `CLAUDE_BIN=/path/to/claude node scripts/eval-fix.ts --label <phase-name> --seq 1`. It runs `/qa` headlessly on a copy of the demo app on a feature branch, answers the stop rules as the owner
  would (same conversation, up to `--max-turns`), then checks everything from git: commit format, a test in every commit, **red on the parent and green on the fix commit re-proved in clean checkouts**, the whole suite, protected paths, no remote, unchanged
  git settings, a clean tree, no secrets, lint-clean consistent reports, and which seeded bugs are gone. Expect 30 to 60 minutes and roughly $10 to $30 for a full run (`--max-total-usd` caps it). Make sure port 4100 is free first.

## Auto-QA (`/qa-auto`)

The gate is `core/auto-qa/` (see [decision 0004](docs/decisions/0004-auto-qa.md) and the Auto-QA section of `docs/ARCHITECTURE.md`); the hooks and skills are `hosts/claude/adapter.ts` (hooks.json), `core/skills/qa-auto/` (the toggle) and `core/skills/qa-auto-run/` (what Claude runs when the gate blocks).

- **A gate rule is a branch in `onStop` (`gate.ts`)**, in the order of spec 9.5. Add a case to `tests/core/auto-qa-gate.test.ts`: it drives the real CLI with hook JSON on stdin, so a rule is tested the way Claude Code uses it. Never write anything before rule 2 for a project that has auto-QA off.
- **`qa-auto-run` shares Steps 1 to 5 word for word with `/qa-only`**; `auto-qa-skills.test.ts` fails if they drift. Change the shared steps in `qa-only`, `qa` and `qa-auto-run` together. Its tools are pre-approved like `/qa`'s, but a report-only mode starts the run as `qa-only`, which is what keeps it read-only.
- **A new setting** goes in `settings.ts` (parse, validate, default) and `commands.ts` (`set`, `status`), and in the `qa-auto` skill's table. The settings file has its own `schema_version`; a newer one keeps auto-QA off and is never overwritten.
- **Hooks must never throw or print anything unexpected.** Wrap new work in the existing `safely`; stdout is read by Claude Code as JSON.
- **The end-to-end test** (spec section 14): `CLAUDE_BIN=/path/to/claude node scripts/eval-auto.ts --label <phase-name>`. Real Claude Code, the built plugin, a copy of the demo app per scenario (auto on and a change; `#noqa`; auto off; `#qa`; `/qa-auto off` then a change). Everything is checked from files and git, not from the agent's words.
  Two scenarios start a real QA run: expect about 10 to 20 minutes and a few dollars each. Port 4100 must be free. Do not rebuild the plugin while it runs.

## Global lessons and the memory review

The lesson logic is `core/lib/memory/lessons.ts` and the review is `core/lib/memory/review.ts` ([decision 0005](docs/decisions/0005-global-lessons.md)); the owner's interface is the `qa-memory-review` skill over `qamind lessons ...` and `qamind memory review|stats|prune`.

- **Reviewing pending lessons** (spec section 16): run `/qamind:qa-memory-review lessons`, or read `~/.qamind/pending-lessons.md` and move an entry you accept into `~/.qamind/global-lessons.md` by hand (a `- ` bullet of at least 20 characters is enough). Only approved lessons are ever loaded, and a hand-edited one that names a project, a web address, a file or code is skipped with a reason in the next run's context.
- **The decision commands must never be pre-approved** by any skill (`lessons approve|reject`, `memory prune`): the host asking the user is the consent step. `review-skill.test.ts` checks it. If you add another owner-only command, add it to `OWNER_COMMAND` in `core/lib/hooks.ts` too, so a QA run cannot run it, and to the hook test.
- **Do not add an MCP tool that approves, rejects or removes** a lesson or memory: a test refuses one by name.
- **A new genericity rule** goes in `NOT_GENERIC` in `lessons.ts`; it then applies at proposal, approval and load. Add a case to `lessons-review.test.ts`.
- **The end-to-end test**: `CLAUDE_BIN=/path/to/claude node scripts/eval-lessons.ts --label <phase-name>`. Real Claude Code, five scenarios (a run is given only the approved lesson; a relevant lesson is used (observation); the review without consent changes nothing; with consent it decides correctly; a QA run told to approve is refused). About $3 and 15 minutes.
  Port 4100 must be free; do not rebuild the plugin while it runs.

## Hosts (Cursor, generic, and adding more)

Each host is a folder under `hosts/` ([decision 0006](docs/decisions/0006-multi-host.md), [docs/ADDING-A-HOST.md](docs/ADDING-A-HOST.md)). `qamind setup` renders it into `build/<id>/` (git-ignored) and applies its edits through `cli/src/setup/ops.ts`.

- **Try an install without touching your real tools:** `QAMIND_USER_HOME=/tmp/u QAMIND_HOME=/tmp/s QAMIND_BUILD_DIR=/tmp/b node cli/src/setup-main.ts setup --host cursor --skip-build`, then `status` and `uninstall` the same way.
- **The conformance suite is the gate for a host:** `npm test` runs `tests/conformance/` (every folder in `hosts/`, and a dummy host). Set `CLAUDE_BIN=/path/to/claude` to include Claude Code's install, status and uninstall through its own CLI in an isolated config folder; without it those tests are skipped, and the skip shows in the output.
- **Raising a tier needs a real run on that host** and a row in the certification log in `docs/HOSTS.md` (what ran, what passed, what could not be seen, the host's version). A test refuses any host but Claude Code claiming `full`.
- **Core never names a host**: `tests/conformance/core-neutral.test.ts` fails if the shared instructions or the runtime's messages mention a host's commands, tools, variables or folders, and if a placeholder core uses is missing from `docs/ADDING-A-HOST.md`.
- **A new placeholder** goes into the core text, into every host's `placeholders()` (an unknown one fails the build) and into the table in `ADDING-A-HOST.md`.
- **Releasing and updating:** releases are Git tags (`vX.Y.Z`), and `qamind update` moves a checkout to the latest tag (never the tip of `main`), rebuilds and re-renders every install. There are no tags yet (the owner has not said the first release is ready); until then `--edge` follows the branch.
- The setup scripts (`setup`, `setup.cmd`, `bin/qamind.mjs`) are plain and small on purpose: they check Node, then hand over to `cli/src/setup-main.ts`.

## Changing the admin report

The admin report is rendered by `core/lib/adminreport.ts` (Markdown) and `core/scripts/export-html.ts` (HTML) from the same model; the consistency check
(`core/scripts/consistency-check.ts`) parses the written Markdown, so a format change must update the renderer, the parser and the golden file together.
Regenerate the golden example with `UPDATE_GOLDEN=1 node --test tests/core/admin-report.test.ts` and review the diff of
`tests/core/golden/admin-report.md` and `docs/examples/ADMIN-REPORT.example.md`.

## Updating the knowledge base

`core/knowledge/` holds one topic per file (under 300 lines), written as checklist-style instructions to the agent, in our own words.

1. **Source first.** Read the current primary or official source before changing a claim. Do not paste or closely paraphrase; no quote over
   12 words. Share-alike sources (OWASP, MDN, Wikipedia, Rails Guides) are used for ideas only, in our own wording.
2. **Record it.** Add or update the entry in `docs/KNOWLEDGE-SOURCES.md` (URL, publisher, license, `Accessed:` date, which files it informed, what
   we used). Every knowledge file must have at least one source; the tests enforce it.
3. **Keep it generic and safe.** No product names, no host/tool names, no demo-app details; every check must be non-destructive and runnable on
   staging. Mention only tools that exist (the API runner, the browser tools, the page audit).
4. **Index it.** New files go in `core/knowledge/INDEX.md` (by situation, and by `stack.frameworks` for framework notes).
5. **Version it.** Bump `core/knowledge/VERSION` (patch for wording or a new section in an existing file, minor for new files) and add a line to `CHANGELOG.md`.
6. `npm test` (the knowledge checks run there), `npm run build`, `npm run check:generated`.
7. After a substantive change, run the scored evaluation (`docs/EVALUATION-LOG.md`) and compare with the recorded baseline.

Known gaps (not yet covered): GraphQL, WebSocket and server-sent-event APIs; a JWT-specific file; time zones as their own topic; import/export and
long-running or scheduled jobs; cross-browser testing beyond a list of differences to suspect; Nuxt, NestJS, Angular, Svelte, Flask and FastAPI
notes; handling secrets and personal data found in evidence (arrives with Phase 7.6).

## Trying the agent end to end

`docs/EVALUATION-LOG.md` has the exact procedure (a copy of the demo app without its answer key, a scratch `QAMIND_HOME`, a headless
`claude -p` run, and the scorer). A quick run costs roughly $2 to $3 and takes 10 to 15 minutes.

After a change to memory (`core/lib/memory/`, the memory protocol or the skill's memory steps), also run the learning test:
`CLAUDE_BIN=/path/to/claude node scripts/eval-learning.ts --label <phase-name> --seq 1`. It runs `/qa-only` twice on the demo app against one scratch memory,
changes the demo copy in between (`scripts/learning-mutation.ts`: a new Help page and endpoint, one endpoint dropped from the spec) and seeds an owner-confirmed
false alarm, then checks that the second run applied memory, skipped the false alarm, reported what changed, was not slower to reach the critical flows, and left no
secrets in the store or the reports. Make sure nothing else is listening on port 4100 first (the script refuses to start if so).
