# KILOCODE_CHANGE_MARKERS Review — PR #13414 `feat/btw-ephemeral-fork`

**Branch:** `review/pr-13414-btw` @ `bf2e1176` | **Base:** `b1934a39266e6114a7cae0d8104b8c87df20fb80` (origin/main ancestor) | **Date:** 2026-08-25

## Methodology

Compared upstream (`b1934`) vs `HEAD` via `git show <rev>:<path>` and `git diff b1934..HEAD`. Grepped `kilocode_change` in both revisions. Verified shared-file marker style (inline `// kilocode_change`, `// kilocode_change start`/`end`) and exempt-path rule (paths containing `kilocode` need no markers per `AGENTS.md`). Cross-checked revert completeness for previously reverted robustness files (`index.ts`/`worker.ts`/`app.tsx`) — no lingering diff remains.

8 files changed (`git diff --name-only b1934..HEAD`); full audit run, only findings/verification-needed files listed below.

## Findings

No marker removals detected — `git diff` shows zero `^-.*kilocode_change` deletions across shared files.

### `packages/opencode/src/command/index.ts` — PASS

Added `import { btwCommand } from "@/kilocode/command/btw" // kilocode_change` and `commands["btw"] = btwCommand()` inside the existing `// kilocode_change start`/`end` block. Upstream marker count preserved +1 inline; block structure intact.

### `packages/opencode/src/provider/transform.ts` — PASS (1 minor correction)

3 new inline markers correctly applied:

- `import { kiloProviderOptions } … // kilocode_change` — upstream lacked marker on this import; now corrected.
- `const cacheKey = ((globalThis as any).__KILO_BTW_OVERRIDES__ … // kilocode_change - btw fork reuses parent promptCacheKey` (2 sites: `prompt_cache_key` and `promptCacheKey` branches).

Style matches existing single-line `// kilocode_change - <reason>` convention. No block markers needed. Human verify: `globalThis` override is intentional ephemeral fork plumbing; marker rationale is sufficient.

### `packages/opencode/src/session/prompt.ts` — PASS

Added `import { KiloBtw } from "@/kilocode/session/btw" // kilocode_change` and two block-wrapped sections:

- `// kilocode_change start - btw side-question handler (fork with cached context, then delete)` … `// kilocode_change end` (~190 lines, `handleBtw` def)
- `// kilocode_change start - btw side-question (fork with cached context, then delete)` … `// kilocode_change end` (3-line dispatch in `command`)

Block markers correctly paired; content fully Kilo-owned but correctly annotated as shared-file insertion.

## Notable Non-Findings

- **Kilo-owned exempt files correctly unmarked:** `src/kilocode/command/btw.ts`, `src/kilocode/session/btw.ts`, `test/kilocode/session/btw.test.ts`, `test/kilocode/session/btw-integration.test.ts` — `grep kilocode_change` returns 0 matches as expected; no markers required.
- **Revert completeness verified:** `index.ts` now differs from `b1934` only by the 2-line btw addition; no `worker.ts`/`app.tsx` diff remains. Earlier robustness-fix markers were cleanly reverted.
- **Changeset exempt:** `.changeset/btw-ephemeral-fork.md` needs no markers.

## Command Outputs (truncated)

```
$ git diff --name-only b1934..HEAD
.changeset/btw-ephemeral-fork.md
packages/opencode/src/command/index.ts
packages/opencode/src/kilocode/command/btw.ts
packages/opencode/src/kilocode/session/btw.ts
packages/opencode/src/provider/transform.ts
packages/opencode/src/session/prompt.ts
packages/opencode/test/kilocode/session/btw-integration.test.ts
packages/opencode/test/kilocode/session/btw.test.ts

$ git diff b1934..HEAD -- packages/opencode/src/command/index.ts
+import { btwCommand } from "@/kilocode/command/btw" // kilocode_change
+      commands["btw"] = btwCommand()

$ git diff b1934..HEAD -- packages/opencode/src/provider/transform.ts | head -30
-import { kiloProviderOptions } from "@/kilocode/provider-options"
+import { kiloProviderOptions } from "@/kilocode/provider-options" // kilocode_change
+    const cacheKey = ((globalThis as any).__KILO_BTW_OVERRIDES__ … // kilocode_change - btw fork reuses parent promptCacheKey
-      result["prompt_cache_key"] = input.sessionID
+      result["prompt_cache_key"] = cacheKey

$ grep -n kilocode_change (HEAD vs b1934 counts)
command/index.ts: 15->16 markers (+1); transform.ts: 38->41 (+3); prompt.ts: ~120->~124 (+4 incl. import + 2 blocks)
kilocode-owned btw.ts files: 0 markers (exempt)

$ git diff b1934..HEAD | grep "^-.*kilocode_change"
(no output — no marker deletions)
```

## Limitations

- Checked `b1934..HEAD` only; did not fetch `gh api repos/Kilo-Org/kilocode/pulls/13414/files` (local diff assumed equivalent to PR head `bf2e1176`).
- Marker style validated syntactically; semantic merge-conflict risk not simulated (`bun run script/check-opencode-annotations.ts --worktree` not executed — recommend running in CI).
- `kilo/main..HEAD` includes unrelated upstream drift; scoped review to `b1934..HEAD` for PR isolation.
