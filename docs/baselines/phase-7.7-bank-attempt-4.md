# Test bank, bug lifecycle and feedback, end to end: phase-7.7

2026-11-03T05:00:58.844Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, one copy of the demo app changed between runs. Total cost $2.17.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: find, and save checks | 2.8 | $0.61 | FAIL: no test was saved to the bank; no saved test protects the page_size bug (it is the bug this test fixes and reintroduces) |
| feedback on run 1 and the fix | - | - | FAIL: run 1 did not give what is needed (no summary or no protected bug) |
| run 2: the bank first, the bug fixed, the feedback honoured | 2.98 | $0.64 | FAIL: the agent never ran the test bank; no bank results in the run folder |
| the bug is reintroduced | - | - | FAIL: The demo app's src/api.mjs no longer has the line this test changes (pageSize < 1 || pageSize > 100). |
| run 3: the bug is back | 3.8 | $0.92 | FAIL: the agent never ran the test bank; the test that protects the page_size bug is "undefined", expected failed; the page_size bug is "not reported", expected regressed (came back); the 30-second summary does not say a problem came back; the admin report does not mark the problem as having come back; the technical report does not mark the problem as having come back; memory says the bug is "undefined" |
