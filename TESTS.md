# TESTS.md — PR #13414 `feat/btw-ephemeral-fork` Review

**Branch:** `review/pr-13414-btw` @ `bf2e117680` | **Base:** `b1934a39266e6114a7cae0d8104b8c87df20fb80` | **Date:** 2026-08-25
**Upstream compare:** `kilo/main` (42 commits ahead of base)

## Scope / Methodology

Verified whether the PR removes any Kilo-specific tests (paths containing `kilo`/`kilocode` or `kilocode_change` markers/assertions). Checks executed:

- `git diff b1934..HEAD --stat` and `--name-status` — PR-local diff
- `git diff --diff-filter=D/R` — deletion/rename detection
- `git diff kilo/main..HEAD --stat` and `-- test/ --stat` — upstream comparison per task spec
- `git diff --stat -- "*test*"` — glob filter for test paths
- `gh api repos/Kilo-Org/kilocode/pulls/13414/files` — GitHub file list
- `grep -c kilocode_change` on new test files + `git ls-tree` / `cat-file` existence checks
- `git log b1934..HEAD --name-status` and `git rev-list --count b1934..kilo/main` to disambiguate drift

## Findings

**No Kilo-specific tests removed. PR only adds tests.**

- `b1934..HEAD` touches 8 files: 5 added (`*.md` + `btw.ts` x2), 3 modified — **0 deletions, 0 renames** (`--diff-filter=D/R` empty). Test delta: 2 added, 0 deleted.
  - `A packages/opencode/test/kilocode/session/btw.test.ts` (84 lines)
  - `A packages/opencode/test/kilocode/session/btw-integration.test.ts` (74 lines)
- `gh api` confirms same 8 files: `added` x4, `modified` x4 — consistent with local diff.
- `*test*` filtered stat shows only the 2 new files (+158 insertions).
- New tests reside under `packages/opencode/test/kilocode/session/` — Kilo-owned path, no `kilocode_change` marker needed (grep count 0, expected).
- Apparent deletions in `kilo/main..HEAD` (6 test files under `packages/opencode/test/kilocode/`) are **false positives**: all 6 (`bootstrap-runtime`, `lazy-commands`, `lazy-completion`, `editor-context-injection`, `ingest-shutdown-lifecycle`, `shared-location-map`) are absent in both base `b1934` and `HEAD` but present in `kilo/main` (`b1934..kilo/main` shows them as `A`). Base is 42 commits behind `kilo/main`; PR branch forked before they landed — not a PR deletion.

## Notable Non-Findings

- No modification or deletion of existing tests in `b1934..HEAD` scope.
- `git diff kilo/main..HEAD -- test/ --stat` returns empty — repo has no top-level `test/` directory; Kilo tests live under `packages/opencode/test/`, `packages/kilo-vscode/tests/`, etc. Checked those explicitly.
- No `kilocode_change` assertions removed; added files correctly use Kilo path isolation.

## Command Outputs (summarized)

```
git diff b1934..HEAD --stat
 8 files changed, 538 insertions(+), 4 deletions(-)
  .changeset/btw-ephemeral-fork.md | 5+
  packages/opencode/src/command/index.ts |2+
  packages/opencode/src/kilocode/command/btw.ts |14+
  packages/opencode/src/kilocode/session/btw.ts |159+
  packages/opencode/src/provider/transform.ts |9+-
  packages/opencode/src/session/prompt.ts |195+
  packages/opencode/test/kilocode/session/btw-integration.test.ts |74+
  packages/opencode/test/kilocode/session/btw.test.ts |84+

git diff --diff-filter=D b1934..HEAD          # (empty)
git diff --diff-filter=R b1934..HEAD          # (empty)
gh api pulls/13414/files
  added .changeset/btw-ephemeral-fork.md
  modified packages/opencode/src/command/index.ts
  added packages/opencode/src/kilocode/command/btw.ts
  added packages/opencode/src/kilocode/session/btw.ts
  modified packages/opencode/src/provider/transform.ts
  modified packages/opencode/src/session/prompt.ts
  added packages/opencode/test/kilocode/session/btw-integration.test.ts
  added packages/opencode/test/kilocode/session/btw.test.ts

git diff kilo/main..HEAD --diff-filter=D  # 8 D (changesets) + 2 D (webview) + 6 D (kilo tests added after base)
git rev-list --count b1934..kilo/main     # 42
git cat-file -e b1934:<kilo test>         # missing (all 6)
git cat-file -e kilo/main:<kilo test>     # present (all 6)
```

## Limitations

- File-level stat only; no intra-file assertion diff audited beyond marker grep.
- Tests not executed (`bun test`) — existence check only.
- `kilo/main..HEAD` test/ prefix miss due to monorepo layout mitigated by explicit `packages/opencode/test` checks.
- Base drift (42 commits) means upstream test additions appear as deletions in `kilo/main..HEAD`; resolved via `b1934` existence probe.

## Conclusion

**Pass — no missing tests.** PR strictly adds 2 Kilo-specific ephemeral-fork tests; no existing Kilo tests were removed or altered relative to its declared base.
