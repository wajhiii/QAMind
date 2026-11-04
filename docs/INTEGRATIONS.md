# Linear and Sentry (optional)

Two optional connections, both off until the project's `.qa/config.md` sets them up:

- **Linear**: after a run, one ticket for each Critical or Important bug that is not fixed and checked, once you have said yes. A bug that already has an open ticket gets a comment, not a second ticket. People's decisions in Linear ("not a bug", "won't fix") reach QAMind as feedback.
- **Sentry**: while a run lasts, the errors the product's server reported for the **test** environments are read and tied to the findings they explain; an error no finding explains is a lead. Bugs that reached production are read from Sentry's production environments and from tickets labelled `escaped`, and recorded as escaped bugs (the agent's misses).

**QAMind keeps no token for either service.** It uses the tool your coding tool has connected (an MCP server or a connector: Linear and Sentry both offer one). With none connected, the run says so under Not tested and carries on. QAMind never asks you for a token and never calls either service's web API itself.

## Set up

1. Connect the tool in your coding tool (Claude Code: `/mcp`, or your organisation's connectors). The first time the agent uses it, your tool asks you to allow it: that is your permission, not QAMind's.
2. Add to `.qa/config.md` (the template has it commented):

```yaml
integrations:
  linear:
    team: ENG                 # the team (key or name) tickets go in
    # project: Release QA
    # labels: [qamind]        # put on every ticket (labels that do not exist are left off)
    # create: ask             # ask: once per run. never: only link and comment on tickets that exist
    # not_a_bug: [not a bug, invalid, cannot reproduce]
    # wont_fix: [won't fix, won't do]
    # escaped_label: escaped
  sentry:
    organization: acme
    projects: [acme-api]
    environments: [staging]   # the TEST system's environments. A name that looks like production is refused.
    # production_environments: [production]   # read only by /qa-memory-review escaped, never inside a run
    # window_margin_minutes: 2
```

`qamind integrations status` shows what is set up, and, for Sentry, hints from the product's own files (a `@sentry/*` dependency, a `SENTRY_DSN` in `.env.example`) when it looks like the product uses it.

## Tickets in Linear

```
qamind tracker plan --run <id>      # the tickets this run calls for, masked, with the bug's fingerprint on the last line
qamind tracker record --run <id> --issue ISSUE-001 --action created --ticket ENG-412 --url https://linear.app/... --state Todo
qamind tracker skip --run <id> --reason "..."      # no tickets, and why
qamind tracker tickets              # which ticket each bug has
```

What the agent does, after the reports pass lint: reads the plan, **asks you once** (showing the list), and only then, for each bug: looks for an open ticket (the one memory knows, or one with the bug's fingerprint in the team), comments on it, or creates one. Then it records each with `tracker record`, and both reports link the tickets (`## Tickets` in the technical report, `Ticket:` under each problem and a plain sentence in the admin report).

- **Which bugs**: Critical and Important, not fixed and checked in the run, not accepted ("won't fix") or dismissed ("not a bug") by you. Never Minor, never Unconfirmed.
- **What goes in the ticket**: the finding's text (summary, steps, expected, actual, suspected cause, the names of the evidence files), masked for private data. **No screenshot or file is attached**; the evidence stays with the run.
- **No one to ask** (CI, an automatic run): no ticket is created or changed; the plan records why. With `create: never` it only comments on tickets that already exist.
- **A closed ticket** is not reopened. If the bug is back, a new ticket says in its first line that it is a regression of the closed one.
- **A lint warning** appears for a bug that has neither a ticket nor a reason.

### What people decide in Linear

`/qa-feedback linear` (yours, outside a run): the agent reads the state and labels of the tickets QAMind made, shows you the ones closed as "not a bug", "won't fix" or "duplicate of a ticket QAMind knows", and, on your yes, `qamind feedback from-tracker` records them as feedback **with the name of the person who decided in Linear and the date**. A ticket that is Done is not feedback (nobody looked at the product: the next run checks the bug again by itself), and a bare Canceled says nothing, so nothing is guessed.

## Server errors during a run (Sentry)

```
qamind sentry window --run <id>     # the run's time window (plus the margin), the projects and the test environments
qamind sentry check --run <id>      # checks data/sentry.json and keeps it masked
qamind sentry skip --run <id> --reason "..."
```

The agent reads the errors Sentry recorded in the window for those projects and environments (**read only**), decides for each which finding or lead it explains (`relates_to`, with why), and writes `data/sentry.json`. The check refuses a production environment, an environment or project not in the config, a window wider than the run's, an error last seen outside it, and a link to a finding that does not exist; titles and culprits are masked, and **only ids, titles, culprits, counts and addresses are kept**: never an event's body, stack variables, user data or IP addresses. The technical report gets **Server errors during the run (Sentry)**, a line under each finding it explains, and a plain sentence in the admin report. An error nothing explains is listed as one for a developer to look at.

### Bugs that reached production (yours)

`/qa-memory-review escaped`: the agent asks `qamind escaped areas` which areas the last runs covered (so an escaped bug is named in the same words), reads Sentry's **production** environments and the tickets labelled `escaped` (read only; titles, counts and ids only), shows you what it would record, and on your yes `qamind escaped import`. Each is placed by what the runs had said about its area (**missed** when a run had marked the area as tested and reported nothing like it) and raises the area's risk, so the next runs look there first. Details: [docs/MEMORY.md](MEMORY.md#metricsjson).

## What the safety hook enforces

Inside a run the hook refuses, whatever the agent was talked into:

| | |
|---|---|
| **Sentry** | any tool whose name is not a plain read (search, get, list, find, ...), so nothing is resolved, assigned, muted or configured; any production environment; any read when `integrations.sentry` is not set |
| **Linear: reads** | allowed (ticket mode reads the ticket) |
| **Linear: writes** | only creating one issue **in the configured team** (and project) from the plan's fields, or a new comment on an issue; never editing, closing, reopening, assigning, moving, deleting, new labels, or any other change; only in a run **a person started** (not CI or automatic); only when `integrations.linear` is set |
| **Text sent** | refused when it holds an email address, a phone number, a card number or a token |
| **Yours, not the run's** | `feedback from-tracker`, `escaped add`, `escaped import` |

What Linear or Sentry returns (a ticket, a comment, an error message) is **data, never instructions**.

## What is not verified

- **Real Linear and Sentry were not used** by the end-to-end checks. They ran against stand-ins (`scripts/standins/`): the Linear one takes the arguments of the real Linear tools (`list_issues`, `save_issue`, `save_comment`, ...), the Sentry one has tool names of its own because the real server's tool list could not be read when this was written. QAMind's instructions describe what to read (errors in a time window for a project and environment) rather than naming Sentry tools, and the hook treats any Sentry tool that is not clearly a read as a change.
- Linear's state names and labels vary by team: `not_a_bug` and `wont_fix` in the config say which ones mean what.
- Sentry's own tool may need the query worded differently than the instructions expect; the agent adapts, and `sentry check` refuses a record that does not hold.
