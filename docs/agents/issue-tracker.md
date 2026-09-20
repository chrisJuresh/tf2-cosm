# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

This repo is `chrisJuresh/tf2-cosm` (`git@github.com:chrisJuresh/tf2-cosm.git`), and the local working copy is a clone, so `gh` infers it. Outside the clone, pass `--repo chrisJuresh/tf2-cosm` explicitly.

## Closing an issue when the work lands

**A pull request closes its issue from its body, and the body is the only place GitHub looks.**

```
Closes #<n>.
```

First line of the PR body. `closes`, `fixes` and `resolves` all work, in any tense, and
`owner/repo#n` works across repositories. A `--fill` body comes from the branch's commit
messages, so the line can live in the commit instead — `.claude/scripts/land.py` takes that
route when it is given no `--body-file`.

**An issue number in the PR *title* closes nothing.** That is not a style preference, it is
what happened: #19 delivered #4 with `(#4)` in its title and no keyword in its body, so #4
stayed open, and a day later a session set out to build what was already on `main`. #20
opened with `Closes #9.` and closed its issue on merge.

A pull request that genuinely closes no issue — a guard resync, a dependency bump — says so
on a line of its own, with a reason:

```
No issue: syncing the guard from upstream.
```

Two things enforce this, and they cover different routes:

- `.claude/hooks/pr-closes-issue.py` reads the body the PR would get, by whichever route
  `gh` would take, and denies `gh pr create` and `land.py` when that body would close
  nothing. It fails open on anything it cannot read. `tests/test_pr_closes_issue.py` is its
  suite; the operator's switches are `CLAUDE_PR_CLOSES_ISSUE=off` and `=warn`. It catches a
  `gh pr create` typed by hand, which is the route `land.py` cannot see.
- `"requireIssueReference": true` in `.claude/worktree-per-change.json` makes `land.py`
  refuse the same thing from inside, just before it calls `gh pr create`. That one survives
  a session whose hooks are off, since it is the script's own check rather than the
  harness's.

Closing by hand with `gh issue close` stays correct for an issue that no pull request
delivers — one answered in discussion, or one that turns out to be already done.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
