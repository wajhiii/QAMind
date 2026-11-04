# 0013: a folder that holds several repositories (workspaces)

Status: accepted, 2026-11-04 (found by the owner's first real use: the product is an API, a client portal and an admin, each its own repository, opened from their parent folder).

## Problem

QAMind took "the project" to be the folder the agent starts in and accepted it only if it was a git repository, had a dependency manifest, or already had `.qa/config.md`. A parent
folder that holds the repositories is none of those, so the first run stopped with `no-project`. The same assumption sat under four more things: which git state `diff` mode reads,
what a task changed for auto-QA, what the stack is, and where fixes are committed.

## Decision

A **workspace** is a folder that is not inside a git repository, has no dependency manifest or project file of its own, and has at least one project folder directly in it (a `.git`, a
manifest, or a `.csproj`/`.sln`; names starting with a dot, `node_modules`, `vendor`, `dist`, `build`, `coverage`, `tmp` and `temp` never count; at most 40). It is accepted as the project.

- **One config, one set of reports, one memory** for the workspace. The memory id is path-based (a workspace has no git remote of its own).
- `run_start` returns `project.workspace.repos`; `git.repos` has each repository's branch, commit, base and dirtiness, and `git.changed_files` lists every repository's changes with its folder
  as the first part of the path. `git.is_repo` stays false: the folder itself is not a repository.
- The stack is the union of the repositories' stacks; its commands stay empty (a test command belongs to one repository).
- Auto-QA snapshots every repository (HEAD per repository, changed files under their folder) and compares them at the end of the task, so a task in any repository counts.
- No `.gitignore` is written (in the parent or in a repository): a parent that is not a repository has nothing to protect, and a repository is not the place QAMind writes to.
- The skills are told once, in the shared workflow: the repositories are one product; look for each surface's source in its repository's folder; name the repository when saying where a bug lives.

## Not in this decision: fixing

Fix mode is a state machine around one repository (a clean tree, a branch, a commit per fix, a regression test proved by taking the fix out, protected files, the stop rules). Making it span
repositories would touch the code whose job is to be strict. So a workspace run **says so up front** (an advisory from `run_start` for a fix run, before any testing) and `fix_preflight`
refuses with the way out: start in the repository's folder. Per-repository fixing from the workspace (one repository per fix run, the config shared) is a later step, if it is wanted.

## Considered

- **Treat any folder as a project** (drop the check): would also accept a home folder or a downloads folder and write a `.qa/` into it.
- **Walk up to find a repository or config**: a repository's own run would pick up a parent's config by accident; two layouts are enough for now.
- **One project per repository with a shared config**: three memories, three report sets, and no run that tests the API and the UIs together, which is the point of QAMind.

## Checked

`tests/core/workspace.test.ts` (five tests; eight deliberate breaks of the code were each caught) and the built plugin's command line on a folder shaped like the owner's.
Not checked: a real run by an agent in a workspace, and fix mode from a workspace beyond its refusal.
