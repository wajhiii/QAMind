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

Windows (the code avoids POSIX-only APIs where it can, but nothing has been run there), and Linux outside CI.

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
