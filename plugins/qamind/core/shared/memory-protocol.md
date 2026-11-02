# Memory protocol

Memory is private to the user and the machine: it is kept in the QAMind user store, never in the project's git, and is never uploaded.
Each project has its own memory, shared by every host on the machine. **Memory is leads, not proof.** It tells you where to look; it
never tells you what is true now. Re-verify everything, and say when memory shaped a decision.

You read and write memory **only through the qa-memory tools** (the qa-memory tools (their names start with mcp__plugin_qamind_qa-memory__)). Do not look for memory files, read them or edit them:
the tools validate what you send, merge near copies, refuse secrets and personal data, and keep the files consistent.

## What memory holds

| Part | What it is | How it is written |
|---|---|---|
| Product map | web UIs, pages, endpoints, roles, journeys, each with first and last seen | `run_finish`, from the pages you recorded with `memory_update_product_map`, the API inventory and the coverage rows |
| Risk areas | areas with past problems, scored by frequency × severity × recency | `run_finish`, from your findings; `memory_update_risk` for an area with no confirmed finding |
| Learnings | atomic learnings (`behavior`, `pitfall`, `test-tip`, `fix-pattern`, `env-quirk`) with confidence 1 to 10 | you, with `memory_save_learning` |
| False alarms | things confirmed not to be bugs, so they are not reported again | you (`memory_mark_false_alarm`) or the owner |
| Run history | one summary per finished run, with compact findings | `run_finish`; read it with `run_history` |

The owner may edit memory by hand (it is plain text). Bad lines are reported in `warnings`, never dropped; tell the user about them.

## 1. Load it (Step 1)

`memory_get_context` returns, bounded in size:
- `focus` and `risk_areas`: where past problems cluster. **Order your charters by them** and spend the most effort there.
- `learnings` by type. `env-quirk` and `test-tip` change **how you run** things (waits, setup, order); `pitfall` and `behavior` tell you
  **what to look for**. Each one is a lead: check it, and if it no longer holds, say so (see "Adjust" below).
- `false_alarms`: things already known not to be bugs. If you see one again, **do not report it**.
- `previous_findings`: what the last run found. In `regression` mode, re-run every one of them first (steps are in the compact record, details in
  that run's report folder if it still exists). In other modes, re-verify the critical ones early.
- `product_map`: the pages and endpoints known last time. Do not spend time rediscovering them; spend it on what is new or changed.
- `warnings`: malformed memory lines. Mention them to the user.

Then say in one short paragraph what memory tells you to focus on, or that this is a first run. `run_history` shows how earlier runs went.

`qamind api inventory` also prints `changes_vs_memory` (endpoints added or removed since last time): test those first.

## 2. Use it, and cite it honestly

When a learning shaped what you did, or you skipped a known false alarm, record it with `memory_record_applied` (`ids`: `["L-001","FA-002"]`).
It only accepts ids that exist, and records nothing if one does not, which is deliberate: **never invent or guess an id.**
Also put one short sentence in `data/meta.json` → `memory_applied` ("Applied learning L-001 to test access: changed the order number in the
address"). The reports list these, and `report lint` rejects a citation of something that is not in memory.

If a finding resembles a false alarm and is genuinely different this time, keep it, and set `not_a_known_false_alarm` on the finding with the
reason. `report lint` blocks a finding that restates a false alarm the owner confirmed.

## 3. Record what you saw (during the run)

Call `memory_update_product_map` as you visit pages, with `pages`: `[{ "ui": "Client Portal", "path": "/my-orders.html", "title": "My orders", "roles": ["client-a"] }]`.
Give the path only (query strings are dropped; ids in paths are folded together automatically). One entry per kind of page. The title is what
a person would call the page: it is used in the plain-language report. With no OpenAPI spec, also pass `endpoints`: `["GET /orders", "POST /orders"]`;
with a spec, the inventory is used automatically. Repeats are merged, and the answer says what differs from the map so far.

If an area looked fragile but you have **no confirmed finding** for it (a lead you could not reproduce twice, something slow or flaky), flag it with
`memory_update_risk`. Do not call it for confirmed findings: `run_finish` records those.

## 4. Save what you learned (Step 6, before `run_finish`)

Save at most about five learnings, each **one atomic statement** another run could act on:
- `env-quirk`: how the environment behaves ("the report page needs about 5 seconds to show figures: wait for its heading").
- `test-tip`: a way of testing that worked or a trap in testing ("a changed value only shows stale if the list was opened before the change").
- `pitfall`: a kind of defect that this product tends to have ("search text is used as a pattern, so punctuation can crash it").
- `behavior`: how the product works, when a future run would otherwise misjudge it ("a 403 for a customer on admin pages is correct").
- `fix-pattern`: how a defect was fixed here (fix mode only).

Use `memory_save_learning` (`type`, `area`, `text`, optional `confidence`). Near copies are merged automatically (confidence rises). If this run's
evidence agrees with a loaded learning, call `memory_adjust_learning` with `direction: "confirm"`; if it disagrees, `"contradict"` (below confidence 3
it is archived, not deleted).

Do not save: one-off facts, anything already in the config, product data, **bugs** (they are findings and are kept in run history), **secrets, tokens,
passwords, or real people's personal data** (emails, phone numbers, national ID or card numbers). The tool refuses text that contains them and says what
to remove; rewrite it to describe the behaviour, not the data. Do not save guesses: a learning you did not verify gets confidence 3 or 4, not 8.

Save a false alarm only when you checked and it is **not** a bug (by reproduction, or because the spec or config says so) **and** it is likely
to come up again: `memory_mark_false_alarm` with `area`, `symptom` (what was seen) and `reason` (why it is not a bug).

If you noticed something that would help on **any** project (not this one), you may propose at most one global lesson with `lessons_propose`. It must be
generic: no product or project names, addresses, files, tickets or code. It waits for the owner's approval and nothing uses it until then.

## 5. "What I learned this run"

`run_finish` returns `memory_updated` (what changed in the product map, risk areas and false-alarm counts). Together with the learnings you
saved, that is the honest list to show the user. If you saved nothing, say so.

## Rules that always apply

- Never store secrets, tokens, passwords, or real people's personal data anywhere in memory.
- Use the qa-memory tools for memory and run bookkeeping. Never edit memory files by hand, and never edit the plugin's own skill, shared or
  knowledge files. Put improvement ideas in `.qa/suggested-improvements.md`.
- If memory is newer than this QAMind (a tool says so), stop and tell the user to update QAMind. Memory is never half-updated.
