# Test bank, bug lifecycle and feedback, end to end: phase-7.7

2026-11-02T15:44:08.948Z, claude-sonnet-5-5, Claude Code 2.1.314 (Claude Code). Real Claude Code, the built plugin, one copy of the demo app changed between runs. Total cost $2.1.

| Step | Minutes | Cost | Result |
|------|---------|------|--------|
| run 1: find, and save checks | 4.06 | $1.12 | pass |
| feedback on run 1 and the fix | - | - | pass |
| run 2: the bank first, the bug fixed, the feedback honoured | 2.32 | $0.47 | FAIL: the test that protects the page_size bug did not pass after the fix; the page_size bug is not shown as fixed; the admin report has no 'Fixed since the last check' section |
| the bug is reintroduced | - | - | pass |
| run 3: the bug is back | 2.53 | $0.51 | FAIL: the page_size bug is "still-open", expected regressed (came back); the 30-second summary does not say a problem came back; the admin report does not mark the problem as having come back; the technical report does not mark the problem as having come back; memory says the bug is "still-open" |
