# 0012: Linear and Sentry, optional and token-free

Status: accepted (Phase 8). Date: 2026-11-03.

The spec (11.4, 13.5, 13.12, 13.16) asks for four things from these two services: **tickets** for the bugs that matter (updated, not duplicated, by the bug's fingerprint), **people's decisions in Linear** as feedback, **the server errors a run caused** attached to its findings, and **bugs that reached production** (Sentry errors, tickets labelled `escaped`) recorded as the agent's misses.

## No tokens, only the host's tools

QAMind does not hold, ask for or store a Linear or Sentry credential, and does not call either web API. The agent uses the tool the host has connected (an MCP server or a connector), exactly as it uses the browser. Reasons: the spec's rule that credentials come only from `.env.qa` and are never printed; the host already has a consent and permission model for connectors (the user allows each tool once); a token in QAMind's store would be one more secret to leak and to rotate; and "auto-detected" then means the simplest thing that is also true: **configured in the project, and a tool connected in this session**. With no tool, a run says so (`tracker skip`, `sentry skip`, with the reason in the report) and carries on.

The cost is that the instructions cannot name every host's tool. They describe what to read and what to write; the Linear part follows the arguments of the real Linear tools (`list_issues`, `save_issue`, `save_comment`, which were read from their published schemas); **the Sentry part names no tool**, because the real server's tool list and parameters could not be read when this was written (the documentation pages say "not stated" for everything but the OAuth flow; its own tools exist for managing projects as well as reading). That uncertainty is why the hook is a **deny-unless-clearly-a-read** rule for Sentry rather than a list of known write tools.

## The deterministic part is code; the agent does the talking

| Code (tested, no model) | The agent (instructions) |
|---|---|
| which findings deserve a ticket, the masked text, the fingerprint line, the priority; which ticket a bug already has (memory); the record, the links, the lint; what a Linear state means for feedback; the time window, the check of the Sentry record (environment, window, links), masking; the areas an escaped bug is named in and the placement | asking the person once; searching Linear for an open ticket with the fingerprint; creating or commenting; reading Sentry's errors; deciding which finding an error explains; naming the area of a production error |

## Decisions

- **Tickets: Critical and Important, not fixed and checked, not accepted or dismissed by the owner.** Minor findings and unconfirmed leads never get one: a tracker nobody reads is worse than none. One ticket per **bug** (not per finding), found again by **memory** (`memory/tickets.json`, bug to ticket) and, for another person's QAMind or a lost memory, by the **fingerprint text on the last line** of the description. A bug that has an open ticket gets a **comment**; a closed ticket is **never reopened**: a bug that is back gets a new ticket that says it is a regression of the closed one (the spec dedupes against *open* tickets).
- **Ask once, and never when nobody is there.** `integrations.linear.create` is `ask` (default) or `never`. A CI or automatic run creates nothing and records why; the hook enforces it (the marker's `trigger` is not `manual`), not only the instruction.
- **The hook limits what a run can do in Linear to the plan**: create one issue in the configured team (and project) from the plan's fields, or add a new comment on an issue. Editing, closing, moving, assigning, deleting, new labels, comments on projects or documents, replies and every other tool are refused, as is text with an email address, phone, card number or token. Reads are always allowed (ticket mode reads the ticket). A prompt-injected page that talks the agent into a ticket for another team, or into "close ENG-1", meets the hook. The configured team and project, and the test environments, are stored in the **run marker** when the run starts, so the hook needs neither the config file nor the model's say-so.
- **Sentry is read only, and only the test system's environments.** `integrations.sentry.environments` may not look like production (refused by name in the config); production environments are listed separately and are read **only by the owner's escaped-bug check**, never inside a run, because a run that mixed real users' errors into its findings would report problems the test did not cause. The record keeps **ids, titles, culprits, counts and addresses only** and is masked; an event's body, stack variables, user data and IP addresses never enter a report or memory.
- **An error is tied to a finding by the agent, checked by code.** `relates_to` must name a finding or lead of the run, or "none"; `why` is required either way; an error last seen outside the run's window (plus a margin of two minutes by default) is refused. An error that nothing explains is listed in the report for a developer, not hidden: it may be a bug the run missed. `sentry check` also suggests, by shared words, a finding an unexplained error might belong to; it suggests and never decides.
- **People's decisions in Linear: only what they say.** A ticket labelled or closed as "not a bug" (configurable names) is `not-a-bug`, "won't fix" is `wont-fix`, a duplicate of a ticket QAMind knows is `duplicate-of`; each is recorded with **the name of the person who decided, as Linear shows it, and the date**. **Done is not feedback** (nobody looked at the product; the next run re-checks the bug), and **a bare Canceled is not guessed at**. It is the owner's command (`/qa-feedback linear`, `feedback from-tracker`): the hook refuses it inside a run, so a ticket a page wrote cannot dismiss a bug.
- **Escaped bugs from Sentry and tickets are the owner's, outside a run** (`/qa-memory-review escaped`): `escaped areas` gives the words runs use for areas (the placement goes by words, [0011](0011-release-verdict-and-metrics.md)), the agent reads production errors and `escaped`-labelled tickets read only, shows the list and records the owner's yes with `escaped import`, which is idempotent by reference and refuses an item with private data without stopping the others.
- **Reports**: `## Tickets` and `## Server errors during the run (Sentry)` in the technical report, a `Ticket:` line and the server errors under each finding, and plain sentences in the admin report ("Tickets and error monitoring": no jargon, and the admin report still never names a tool's internals). The lint **warns** (never fails) for a bug with neither a ticket nor a reason, and for a configured Sentry with no record; it **fails** for a Sentry record that names a finding that does not exist.

## Rejected

- **A QAMind-held token and direct API calls**: see the top. Also would have made the integrations impossible to test without a real workspace and made the hook's job (what may be sent where) impossible, since the call would not be a tool call.
- **Creating tickets in the background or from CI**: nobody is there to say yes, and the spec says to ask.
- **Reopening or editing tickets**: a ticket is a conversation among people; QAMind adds to it and does not rewrite it.
- **Attaching screenshots and evidence**: they hold the product's data. The ticket names the evidence files; a developer opens them from the run.
- **Production errors inside a run**: see above.
- **Treating "Done" as `fixed`**: a status in a tracker says what a developer believes. The bug lifecycle already re-checks open bugs and says "came back" when it is wrong.

## Not verified

- **Real Linear and Sentry were never used**: the real-agent checks (`scripts/eval-integrations.ts`) run against stand-ins (`scripts/standins/`). The Linear stand-in has the real tools' names and arguments; the Sentry stand-in has tool names of its own. A real Linear team may have required fields, workflow rules or label names the stand-in does not, and a real Sentry server will word its tools and queries differently; `sentry check` and the hook's rules are what hold either way.
- Linear's state and label names vary by team: `not_a_bug` and `wont_fix` in the config exist for that, and the defaults are guesses.
- Escaped bugs are placed by words (see 0011): the Sentry or ticket title is only as good as the area the agent names for it.
- Self-hosted Sentry and Linear's other workspaces were not considered beyond "any tool the host connects".
