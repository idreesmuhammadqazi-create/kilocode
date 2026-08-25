# Unnecessary `kilocode_change` Markers — PR #13414 review/pr-13414-btw

**Branch:** `review/pr-13414-btw` @ `bf2e11768` · **Base:** `b1934a392` · **Last merged upstream:** `v1.18.13` (`a1053508`) · **Date:** 2026-08-25

## Methodology

1. Enumerated PR scope: `git diff --name-only b1934a39266..HEAD` → 8 files (3 shared `M`, 4 new kilo-owned `A` under `**/kilocode/**`, 1 changeset `A`).
2. Ran `bun run script/upstream/find-reset-candidates.ts --dry-run` (global scan) and `bun run script/upstream/reset-to-upstream.ts --dry-run` per shared file.
3. Grepped `kilocode_change` in every changed file and in the diff patch (`git diff -U0 b1934..HEAD | grep kilocode_change`).
4. Compared each shared file's `git show b1934:path` vs `HEAD:path` and raw `git diff` to verify markers wrap real logic, not whitespace/comment-only drift. Verified kilo-owned new files are absent in base (`git show b1934:path` → not found) and should be exempt per `KILO_ONLY_PATHSPECS` / `SKIP` rules.
5. Checked marker counts old vs new to isolate PR-added markers.

## Findings

**No unnecessary markers found. 0 files qualify as `markers-only` / `cosmetic-only` reset candidates.**

All 3 shared modified files carry `kilocode_change` markers that correspond to substantive `btw` feature diffs:

- `packages/opencode/src/command/index.ts` — PR adds 1 import (`btwCommand`) + 1 registration (`commands["btw"] = btwCommand()`). Diff is 2 hunks, ~20 added lines. Marker delta `30 → 31`; the single new `// kilocode_change` import line is paired with functional registration. Not markers-only.
- `packages/opencode/src/provider/transform.ts` — PR adds `promptCacheKey`/`prompt_cache_key` override via `__KILO_BTW_OVERRIDES__` cacheKey indirection (3 assignment sites + 1 new `const cacheKey` declaration). Diff ~42 lines across 3 hunks. Also adds `// kilocode_change` comment to the pre-existing `kiloProviderOptions` import (base line had no comment); in isolation that line is cosmetic but file-wide is `large-diff`, so the marker is not unnecessary. Delta `42 → 45`.
- `packages/opencode/src/session/prompt.ts` — PR adds `KiloBtw` import + `handleBtw` handler (~190 lines) + dispatcher (`isBtwCommand` branch). Diff ~220 lines across 4 hunks. Delta `208 → 212`. Markers bracket real fork-with-cached-context-then-delete logic.

No file in this PR is identical to transformed upstream after stripping markers — each has real behavioral change.

## Notable Non-Findings

- 4 kilo-owned new files correctly have **zero** markers (exempt; `KILO_ONLY_PATHSPECS` excludes `**/kilocode/**`): `src/kilocode/command/btw.ts`, `src/kilocode/session/btw.ts`, `test/kilocode/session/btw.test.ts`, `test/kilocode/session/btw-integration.test.ts` — also not present in base, so `upstream-missing` bucket expected.
- `.changeset/btw-ephemeral-fork.md` — no markers, as expected.
- Pre-existing markers in the 3 shared files (inherited from prior Kilo work) were not flagged; only PR-added markers were evaluated against the PR diff, and all wrap new `btw` code.

## Command Outputs

```
# diff scope
.changeset/btw-ephemeral-fork.md
packages/opencode/src/command/index.ts        (M)
packages/opencode/src/kilocode/command/btw.ts (A, kilo-owned)
packages/opencode/src/kilocode/session/btw.ts (A, kilo-owned)
packages/opencode/src/provider/transform.ts   (M)
packages/opencode/src/session/prompt.ts       (M)
packages/opencode/test/kilocode/session/btw-integration.test.ts (A, kilo-owned)
packages/opencode/test/kilocode/session/btw.test.ts             (A, kilo-owned)

# kilocode_change in diff patch (only PR-added markers)
+import { btwCommand } from "@/kilocode/command/btw" // kilocode_change
+import { kiloProviderOptions } from "@/kilocode/provider-options" // kilocode_change
+    const cacheKey = ((globalThis as any).__KILO_BTW_OVERRIDES__ ... // kilocode_change - btw fork reuses parent promptCacheKey
+      result["promptCacheKey"] = ((globalThis as any).__KILO_BTW_OVERRIDES__ ... // kilocode_change - btw fork reuses parent promptCacheKey
+import { KiloBtw } from "@/kilocode/session/btw" // kilocode_change
+    // kilocode_change start - btw side-question handler (fork with cached context, then delete)
+      // kilocode_change start - btw side-question (fork with cached context, then delete)

# per-file reset dry-run (all 3 report Would reset — expected for large-diff, not markers-only)
$ bun run script/upstream/reset-to-upstream.ts <file> --dry-run
[OK] Last merged upstream: v1.18.13 (a1053508)
[INFO] [DRY-RUN] Would reset packages/opencode/src/command/index.ts to transformed upstream v1.18.13
[INFO] [DRY-RUN] Would reset packages/opencode/src/provider/transform.ts to transformed upstream v1.18.13
[INFO] [DRY-RUN] Would reset packages/opencode/src/session/prompt.ts to transformed upstream v1.18.13

# global scan
$ bun run script/upstream/find-reset-candidates.ts --dry-run
(no output — timed out after 240s; see Limitations)
```

Per-file `Would reset` means the working tree differs from transformed upstream, not that it is `markers-only`. Classification as `markers-only`/`cosmetic-only`/`identical` would be reported by `find-reset-candidates`, not by `reset-to-upstream`.

## Limitations

- `find-reset-candidates.ts --dry-run` (full-repo scan, default concurrency 8, translates every changed file against upstream `v1.18.13`) timed out at 240s with no stdout — likely due to repo-wide file count / transform cost. Mitigated by per-file `reset-to-upstream.ts --dry-run` + manual `git show`/`git diff` verification, which together cover the PR's 3 shared files.
- Upstream comparison is against the last merged tag `v1.18.13`; PR base `b1934a39` is newer than that tag, so `git diff b1934..HEAD` (PR-introduced change) is the more precise signal for "markers without actual difference" than tag-based drift. Both were checked.
- No exhaustive `Files Checked` table is included per task request; only counts and findings above.
