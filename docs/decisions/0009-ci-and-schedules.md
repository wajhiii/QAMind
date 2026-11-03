# 0009: CI and pull-request mode, and schedules

Status: accepted (Phase 7.8). Date: 2026-11-03. How to use it: [docs/CI.md](../CI.md).

## Decision

`qamind ci` is an **orchestrator around the host's own CLI**, not a second agent. It starts the host CLI headlessly with the QAMind runtime, waits under a hard time limit, and then reads the run's own data files to decide the result. Everything the team sees (one comment, a commit status, an exit code, the reports as artifacts) is produced from that data, never from what the agent said.

- **The gate is code.** `ci.fail_on` (default: a critical problem, an environment problem) and `ci.warn_on` (default: an important problem) are evaluated against the run's findings, health result, bug lifecycle and bank results (`core/lib/ci/gate.ts`). `critical`, `important`, `minor`, `environment-problem`, `came-back`, `bank-failure` and `not-ready` are the conditions.
  Exit codes: 0 pass or warn, 1 fail, 2 could not check. **A run that could not happen is not a verdict about the change**: a bad config, no credentials, a crashed or timed-out agent, a run left open, or a checkout the agent changed is an `error` status with the reason, and the comment says it is not a statement about the change.
  An environment problem fails the run (the default gate) and the comment says the change could not be checked, not that it is broken.
- **One comment, kept up to date.** The comment carries a marker and is found again on the next push; it is updated only if it carries the marker and a bot wrote it (anyone can paste a marker). Posting and the status are best-effort: a refusal is a warning that names the permission the job needs, and **never changes the exit code**.
  The text is the admin report's verdict and 30-second summary plus the reasons, the problems found and the test bank's result, masked again before it leaves the machine, and bounded below GitHub's comment limit.
- **Report-only is enforced four ways**, not asked for: a CI run is a report-only run (the safety hook), `QAMIND_TRIGGER=ci` is set by `qamind ci` for the agent it starts (so the agent cannot start another kind of run), the host CLI runs with `--permission-mode dontAsk` and a spending cap (`--max-budget-usd`, default 10) and a hard time limit,
  and the tracked files and the commit are compared before and after (a change is an error; nothing is reverted). `qamind ci`, `ci init` and `schedule` cannot be run by a QA run at all (hook), so an agent cannot start CI runs or write workflow files.
- **No memory by default.** A CI run gets a fresh store. `ci.cache_memory` puts a CI-only store in `.qamind-ci/home`, restored by the CI's own cache keyed by repository and branch; never committed, never mixed with a person's memory. Without it, `came-back` and `bank-failure` cannot happen in CI.
- **A host's headless launcher is that host's data.** The command, arguments, how a skill is invoked, the credential variables, the cost field and how a CI job installs the CLI are the `headless` block of `hosts/<id>/host.json` (Claude Code's was researched on 2026-11-03: `claude -p`, `--permission-mode dontAsk`, `--output-format json`, `--max-budget-usd`; **not `--bare`**, which skips hooks and plugins, so QAMind's safety hook would not load).
  Core reads it and names no host (a test keeps `core/lib/ci/` clean), so another host's CLI is a folder. `--agent-command` runs any command instead.
- **Templates are generated, from the project's config.** `qamind ci init --provider github|gitlab` and `qamind schedule` write workflow files that name the config's own login secrets and no value; least permissions (`contents: read`, `pull-requests: write`, `statuses: write`; the nightly only `contents: read`); no run for fork pull requests; concurrency; QAMind fetched from Git at a pinned ref
  (never a registry package) and the host CLI pinned to the tested version; never overwriting a file. GitLab schedules live in GitLab's settings, so `schedule --provider gitlab` prints steps; local cron and Windows Task Scheduler are printed lines (QAMind never edits a scheduler).
- Ticket mode is refused in CI until ticket mode exists (Phase 7.9).

## Found while building, and fixed

- `git status --porcelain` was **trimmed** before its lines were read, which cut the first character of the first unstaged file (`README.md` became `EADME.md`). The same bug had been in `gitInfo` since Phase 1, so **diff mode's list of uncommitted files lost a letter of its first entry**. One helper (`porcelainFiles`) serves both now, with a regression test.
- A pull request is checked out detached with no local `main`, so diff mode could not find its base: `qamind ci` fetches `origin/<target>` and names it in `QAMIND_BASE_REF`, which `gitInfo` honours first.
- My first launcher had Claude Code's command line, credential variables and slash command inside core; it moved into the host's `host.json` before anything was committed, and a neutrality test now covers the new files.

## Not done, or not verified

- **No run on real GitHub Actions or GitLab CI.** From here no CI result is visible. What was run: the whole flow against a stand-in GitHub API with a stand-in agent (the real QAMind CLI doing what an agent does), and `qamind ci` starting real headless Claude Code on a feature branch of the demo app once, locally. The templates were parsed and checked, not executed by a CI service;
  fork pull requests, GitHub-hosted runners (browser, `actions/*` versions), the GitLab APIs against a real server, Windows and Linux runners, and `ci.cache_memory` with the real cache actions are untested.
- GitLab support is written from its documentation (notes API, commit status, merge request variables) and tested against nothing but the shape of the requests (the GitLab client is covered less than GitHub's).
- No Checks API annotations, no per-file review comments, no resolving of old comments, no merge queue support: one comment and one status.
- A job cancelled by a newer push leaves its commit's status pending (that commit is superseded).
- The CI run cannot use a person's test bank or lessons (they are private to the user's store); it builds its own only with the cache.
- `--max-turns` (named on one Anthropic page) is not in the installed CLI's help, so only the spending cap and the time limit bound a run.
