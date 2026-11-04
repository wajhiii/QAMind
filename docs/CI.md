# CI, pull requests and schedules

`qamind ci` tests a pull request headlessly and says the result where the team looks: **one comment** on the pull request that is rewritten on every push, a **commit status**, an **exit code**, and the full reports as **artifacts**. It is always report-only. Design and limits: [decision 0009](decisions/0009-ci-and-schedules.md).

```
pull request ──► job starts ──► qamind ci ──► host CLI (headless) ──► QA run ──► data files ──► gate (ci.fail_on / ci.warn_on)
                                   │ status: pending                                                   │
                                   └──────────────── comment (created once, then updated) · status · exit code · qamind-reports/ artifacts
```

## Set it up (GitHub)

1. **Commit the config.** In CI the project's `.qa/config.md` has to be in the repository. It holds URLs, flows and rules, never passwords. QAMind's own `.gitignore` entry ignores the whole `.qa/` folder, so change it to
   `.qa/*` and `!.qa/config.md` (`qamind ci init` tells you if the file is ignored).
2. **Generate the workflow:** `qamind ci init --provider github` shows it; add `--write` to create `.github/workflows/qamind.yml` (an existing file is never overwritten). `--ref vX.Y.Z` pins the QAMind release it clones (use a release tag, never a branch, once one exists) and `--repo-url` says where to clone it from.
3. **Add the secrets** of the repository (Settings, Secrets and variables, Actions): `ANTHROPIC_API_KEY` (or the secret your host's headless block names) and the test logins your config uses (the generated file lists them). Never put a value in the workflow.
4. **Start the app under test** in the job (the template has a commented step): QAMind tests the environment named in `.qa/config.md`, which in CI is a preview deployment or an app the job starts. It must never be production; the usual refusal of production addresses applies.
5. Open a pull request. The job runs `qamind ci --mode diff`, comments, sets the status and uploads `qamind-reports/`.

GitLab: `qamind ci init --provider gitlab` writes `.gitlab-ci.yml` (or `.gitlab/qamind.gitlab-ci.yml` with an `include:` note when one exists). Add masked CI/CD variables: the API key, the test logins and **`QAMIND_GITLAB_TOKEN`**, an access token with the `api` scope (the job token cannot write merge request notes).

## What `qamind ci` does

1. Reads the CI environment (GitHub Actions or GitLab CI: repository, pull request or merge request number, head commit, target branch, run link). Outside CI it works too: the comment is written to a file and nothing is posted.
2. Checks the config (a missing or invalid config, an unconfirmed address, no test logins, or no host credentials is reported as a run that could not happen, not as a failed change).
3. Fetches the target branch so diff mode can tell what changed, sets a **pending** status, and records which tracked files and which commit the checkout has.
4. Starts the host's own CLI (Claude Code: `claude -p`, see below) with QAMind, under a **hard time limit** (`ci.timeout_minutes`, default 25), with `QAMIND_TRIGGER=ci` so the run is recorded as a CI run whatever the agent asks for, and a fresh memory store.
5. Checks the checkout again: a report-only run that changed a tracked file or the commit is an **error**, not a verdict (nothing is reverted; look at `agent.log`).
6. Finds the run it finished and **reads its data files**: the verdict comes from the findings, the environment health, the bugs that came back and the test bank's results, never from what the agent said.
7. Writes `qamind-reports/` (`ci-result.json`, `PR-COMMENT.md`, a scrubbed `agent.log`, a copy of the run's folder with both reports), appends the comment to the job summary page and sets the step outputs `outcome`, `exit_code` and `run_id`.
8. Posts or updates the comment and sets the final status. A comment or status that cannot be posted is a warning in the output; **the exit code is always the gate's**.

### Exit codes and statuses

| Result | Exit code | Commit status | When |
|---|---|---|---|
| passed | 0 | success | nothing in `fail_on` or `warn_on` matched |
| passed with warnings | 0 | success ("Passed with warnings: ...") | something in `warn_on` matched, nothing in `fail_on` |
| failed | 1 | failure | something in `fail_on` matched |
| could not check | 2 | error | config, credentials, a changed checkout, a crashed or timed-out agent, a run left open |

A job that exits 2 is red. Whether that blocks a merge is your branch protection's decision: the status `qamind` is **error**, with the reason, and the comment says it is not a statement about the change. Do not make the check required if you do not want infrastructure problems to block merges.

## The `ci:` settings

```yaml
ci:
  fail_on: [critical, environment-problem]   # default. Also: important, minor, came-back, bank-failure, not-ready
  warn_on: [important]                       # default
  mode: diff                                 # diff (default), quick, regression or full ("ticket" comes with ticket mode)
  cache_memory: false                        # keep a CI-only memory store between runs
  comment: true
  status: true
  status_context: qamind                     # the name of the commit status
  timeout_minutes: 25                        # hard stop for the agent; the run's own time budget (budget.modes.ci) is separate
```

| Condition | Holds when |
|---|---|
| `critical`, `important`, `minor` | a problem of that severity is open in the run (a problem the owner accepted is not counted; one fixed and verified on a fix branch is not either) |
| `environment-problem` | the health check failed, so the change could not be checked. This fails **the run**, not the change: the comment says so |
| `came-back` | a bug that had been fixed was found again (needs memory: see below) |
| `bank-failure` | a saved test of the test bank failed twice (the bank needs memory too) |
| `not-ready` | the admin report's release verdict is Not ready |

A condition in both lists is a config problem (it would fail the run, so take it out of `warn_on`) and `qamind ci` reports it as a run that could not happen. The cost cap is `budget.modes.ci.max_cost` (default 10 in dollars): it is passed to the host CLI, which enforces it; QAMind itself cannot see a host's spending.

## Memory in CI

A CI machine has no user store, so **a CI run starts without memory**: no learnings, no known false alarms, no test bank, no bug history. It still uses the config and the knowledge base.
With `ci.cache_memory: true` the store lives in `.qamind-ci/home` of the checkout and the workflow restores it with the CI's own cache (GitHub `actions/cache`, GitLab `cache:`), keyed by repository and target branch. It is **never committed and never mixed with anyone's personal memory**; with it, bugs that came back and bank failures become possible in CI.
A test the agent saves to a CI-only bank stays in that cache: nothing is exported into your repository.

## Safety

- **Report-only, in four ways.** A CI run is a report-only run (the safety hook refuses edits outside `.qa/` and the store, git writes, installs); `QAMIND_TRIGGER=ci` is set by `qamind ci`, so the agent cannot start another kind of run; the host CLI runs with `--permission-mode dontAsk` (a call that would need approval is denied, nobody is there to approve it) and a spending cap; and the checkout is compared before and after.
  `qamind ci`, `ci init` and `schedule` themselves cannot be run by a QA run (the hook refuses it), so an agent cannot start CI runs or write workflow files.
- **Secrets.** Read from the environment by name; never printed. The agent's log is scrubbed of every login value and token before it is written. The token is sent only in the `Authorization` header. A comment is masked again (emails, ID and card numbers, phone numbers, your patterns) before it is posted.
- **Pull requests from forks** get no secrets from GitHub, so the generated job does not run for them (a `head.repo.full_name == github.repository` condition). Do not use `pull_request_target` to get secrets for untrusted code.
- **Least privilege.** The generated workflow asks for `contents: read`, `pull-requests: write` (the one comment) and `statuses: write`; the nightly one only `contents: read`.
- **Linear and Sentry in CI.** A CI run creates **no Linear ticket**: nobody is there to be asked, the hook refuses a ticket write when the run's trigger is not a person's own, and `tracker plan` records that as the reason. Sentry is read only, so a CI session that happens to have a Sentry tool connected may read the test environments' errors for the run's window; a CI runner rarely has one, and then the run says so ([docs/INTEGRATIONS.md](INTEGRATIONS.md)).
- **The comment** is updated only when it carries QAMind's marker **and** was written by a bot; a person pasting the marker does not get their comment overwritten.

## The host CLI, headless (researched 2026-11-03)

Read from Anthropic's pages for Claude Code ([headless](https://code.claude.com/docs/en/headless), [GitHub Actions](https://code.claude.com/docs/en/github-actions)) and `claude --help` 2.1.314; recorded in `hosts/claude/host.json` (`headless`):
- `claude -p "prompt"` runs once and exits (0 on success). Authentication in CI is `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; an API key is recommended for a secret shared across repositories.
- `--output-format json` gives the result, session id, `total_cost_usd` (a client-side estimate) and `permission_denials`; `--max-budget-usd` caps spending. `--max-turns` is named on the GitHub Actions page but is not in 2.1.314's help, so it is not used.
- `--permission-mode dontAsk` denies every call that would prompt. The QA skill's `allowed-tools` approve what a QA run needs (QAMind's tools, `qamind` commands, writes inside `.qa/`), so nothing prompts.
- **`--bare` is not used**: it skips hooks, skills, plugins and MCP servers, so QAMind's safety hook and the plugin itself would not load.
- Anthropic's own action `anthropics/claude-code-action@v1` exists. QAMind does not use it: it needs the plugin, its hook and its servers from a pinned Git ref, and the result gate above, which the action does not provide. The generated workflow runs the CLI itself.
- The CLI is installed in the job with `npm install -g @anthropic-ai/claude-code@2.1.314` (the version QAMind was tested with; the package name is not stated on the pages above, so check Anthropic's current install instructions if it changes).
- GitHub withholds secrets from fork pull requests; workflow `timeout-minutes` and `concurrency` are the controls its docs name for runaway cost.

### Another host

A host describes how its CLI runs headlessly in the `headless` block of its own `host.json` (command, arguments with `{prompt}`, `{plugin}`, `{max_cost}`, `{mode}`, how a skill is invoked, which variables authenticate it, how a CI job installs it); core reads it and names no host. `--host ID` picks one, `--host-spec FILE` reads a block from elsewhere, and `--agent-command "CMD"` runs any command instead (it gets `QAMIND_CI_PROMPT` and `QAMIND_CI_MODE` and must start a QAMind run, as any host does). Only Claude Code has a block today.

## Schedules (`qamind schedule`)

Scheduled runs are report-only and follow the budgets. The default suggestion is a nightly `full` run of the default branch's environment: the saved test bank first, then exploration.

| | Command | Result |
|---|---|---|
| GitHub Actions | `qamind schedule --provider github [--cron "0 2 * * *"] [--mode full] [--write]` | `.github/workflows/qamind-nightly.yml` with a `schedule` and `workflow_dispatch`, read-only permissions, a 90-minute limit. GitHub reads the cron in UTC and runs schedules from the default branch only; it may pause schedules of a repository with no activity for 60 days |
| GitLab | `qamind schedule --provider gitlab` | the steps to create the pipeline schedule (GitLab keeps schedules in its settings, not in a file); the generated job already runs in schedule pipelines when `QAMIND_MODE` says so |
| local cron | `qamind schedule --provider cron --cron "15 3 * * *"` | a crontab line that runs from the project folder with **your own** QAMind store; you add it with `crontab -e` (QAMind never edits your crontab) |
| Windows | `qamind schedule --provider windows --time 03:15` | a `schtasks` command for a daily task (not tested on Windows) |

A nightly CI run keeps no memory unless `ci.cache_memory` is on; a local schedule uses your store (`--user-store`), so it learns and keeps your test bank.

## When it says it could not check

| Message | What to do |
|---|---|
| the QAMind config is not usable | commit `.qa/config.md` (see step 1), fill every `REPLACE_ME`, point the URLs at a test environment |
| no test account has both its username and password set | add the logins the workflow names as secrets |
| no Claude Code credentials in the environment | add `ANTHROPIC_API_KEY` (or the secret your host names) |
| cannot find hosts/claude/host.json | QAMind must run from a checkout of its repository (the generated job clones it), or pass `--host-spec` |
| the agent ended before it finished a run | read `agent.log` in the artifacts; the usual causes are credentials, a budget that is too small, or an app under test that is not running |
| the agent was stopped at the time limit | raise `ci.timeout_minutes` and `budget.modes.ci.time_minutes`, or use `quick` mode |
| the run changed the checkout | something wrote to a tracked file during the run; look at `agent.log` |
| the base branch is not available | use `fetch-depth: 0` in the checkout (the template does) so diff mode can tell what changed |
| Posting the comment was refused (HTTP 403) | the job needs `pull-requests: write`; pull requests from forks get a read-only token |

## What was and was not verified

- **Verified:** the comment is created once and then updated in place, with the right pending and result statuses, against a stand-in GitHub API (a local server), with a stand-in agent that drives the real QAMind CLI; the gate matrix, the exit codes, report-only enforcement (a changed file, a crashed agent, a hang, a run left open, missing credentials), memory with and without `cache_memory`, the generated workflows parsed and checked for permissions, fork guard, pins and secrets,
  and the schedule outputs. The real launcher (`qamind ci` starting real headless Claude Code with the plugin) ran once locally against the demo app on a feature branch, posting to the stand-in (`docs/baselines/phase-7.8-ci.md`, `docs/EVALUATION-LOG.md`).
- **Not verified:** a run on real GitHub Actions or GitLab CI (no CI results are visible from where QAMind is built), a real pull request comment, behaviour on fork pull requests, GitHub-hosted runners (Chrome for the browser tool, the pinned `actions/*` versions), the GitLab notes and status APIs against a real server, Windows and Linux runners, and `ci.cache_memory` with the real cache actions.
  The first real run is the test of the templates: read its log before relying on the status.
- A job cancelled by a newer push (`cancel-in-progress`) leaves its commit's status pending; the newer commit has its own.
