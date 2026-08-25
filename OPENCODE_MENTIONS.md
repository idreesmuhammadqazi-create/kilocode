# OpenCode Mentions Review — PR #13414 `feat/btw-ephemeral-fork`

**Branch:** `review/pr-13414-btw` @ `bf2e117680` (base `b1934a39266e6114a7cae0d8104b8c87df20fb80`)  
**PR:** #13414 — feat/btw ephemeral fork  
**Date:** 2026-08-25  
**Reviewer:** Kilo Code (automated)  
**Verdict:** ✅ No new user-facing OpenCode mention or OpenCode web-property link introduced. All existing `opencode` strings in the diff are inherited technical identifiers.

## Scope and Methodology

Reviewed the 8-file diff between base `b1934a39266` and head `bf2e117680` (`.changeset/btw-ephemeral-fork.md`, `packages/opencode/src/command/index.ts`, `src/kilocode/command/btw.ts`, `src/kilocode/session/btw.ts`, `src/provider/transform.ts`, `src/session/prompt.ts`, 2 test files). Methodology per task:

- `git diff --name-only` / `--stat` / `-p` to enumerate changed files and patch.
- `grep -i opencode|OpenCode|opencode\.ai` on the raw diff and on each HEAD file, compared to `git show base:path` for the 3 overlapping files.
- `grep -E opencode\.ai|opencode\.com|github\.com.*opencode` and `grep -rn http` on changed files for URL/web-property links.
- Manual inspection of every user-facing string added by the PR: `btwCommand.description`, `KiloBtw.formatUsage()`, `KiloBtw.formatEntry()`, `prompt.ts` success/error display text (`BTW failed:`, `Side question – not added…`), `.changeset` release note.
- Checked package metadata (`package.json` not in diff) and CLI help/config/SDK surface (no generated SDK/OpenAPI description touched; new command uses `Command.Info` only).

Upstream base used as oracle: any `opencode` token present in HEAD was diffed against base to determine novelty vs. inheritance.

## Findings

**No relevant findings.** No changed file introduces a user-visible `OpenCode`/`opencode` brand, description, help text, error message, or `opencode.ai` URL that should be `Kilo`.

Only `opencode` tokens in the diff are technical and pre-existing:

- `packages/opencode/src/command/index.ts`: `@opencode-ai/schema/legacy-event`, `LayerNode` — npm scope imports, identical to base (line 1, 14, 94). Not user-facing.
- `packages/opencode/src/provider/transform.ts`: `@opencode-ai/core/models-dev`, `input.model.providerID === "opencode"` / `startsWith("opencode")` — provider identifier for the upstream model gateway (Kimi/GLM routing and `promptCacheKey` for the `opencode` provider). All three occurrences existed verbatim at base `b1934a39266` (lines 5, 1481, 1610). The PR only adds `// kilocode_change` annotations and `__KILO_BTW_OVERRIDES__` reuse of `promptCacheKey` — no new brand string.
- `packages/opencode/src/session/prompt.ts`: 15× `@opencode-ai/core/*` / `@opencode-ai/llm` imports and the service key `"@opencode/SessionPrompt"` — all inherited from base (verified via `git show base:prompt.ts`). No new mention.

All new user-facing copy is Kilo-neutral or Kilo-prefixed (`KiloBtw`, `**BTW:**`, `Usage: /btw …`, `Ask a side question without adding to the main conversation.`) and contains zero `opencode` tokens.

No `opencode.ai`, `opencode.com`, or `github.com/anomalyco/opencode` link added; `grep -i opencode.ai` on the diff returned no match. URL grep on changed files only surfaced pre-existing provider docs links (`v5.ai-sdk.dev`, `docs.x.ai`, etc.).

## Notable Non-Findings

- `packages/opencode/src/kilocode/command/btw.ts`, `src/kilocode/session/btw.ts`, both test files, and `.changeset/btw-ephemeral-fork.md` — zero `opencode` hits; no URL at all.
- Command help (`btwCommand.description`: `"ask a side question without adding to conversation (fork with cached context, then delete)"`) does not reference OpenCode.
- Error/success messages in `prompt.ts:handleBtw` (`BTW failed: …`, `*Side question – not added to conversation…*`) are brand-free.
- No `package.json`, `README`, CLI `--help`, or OpenAPI/SDK description change in this PR (SDK not regenerated).
- The `// Codex also applies lossy compaction … until OpenCode needs the same schema budget.` comment in `transform.ts:1852` is an internal code comment about upstream schema budget, not a user-facing string, and is inherited unchanged from base.

## Command Outputs (Evidence)

```
$ git diff --name-only b1934a39266..bf2e117680
.changeset/btw-ephemeral-fork.md
packages/opencode/src/command/index.ts
packages/opencode/src/kilocode/command/btw.ts
packages/opencode/src/kilocode/session/btw.ts
packages/opencode/src/provider/transform.ts
packages/opencode/src/session/prompt.ts
packages/opencode/test/kilocode/session/btw-integration.test.ts
packages/opencode/test/kilocode/session/btw.test.ts

$ git diff b1934a39266..bf2e117680 | grep -i -E "opencode\.ai|opencode\.com|github\.com.*opencode"
NO URL MATCH

$ git diff b1934a39266..bf2e117680 | grep -i opencode
(diff contained only the 3 inherited providerID/import context lines; no new user-facing hit — see full diff grep in logs)

$ grep -in "opencode|OpenCode|opencode.ai" HEAD files
packages/opencode/src/kilocode/command/btw.ts: (no match)
packages/opencode/src/kilocode/session/btw.ts: (no match)
.changeset/btw-ephemeral-fork.md: (no match)
packages/opencode/test/kilocode/session/btw-integration.test.ts: (no match)
packages/opencode/test/kilocode/session/btw.test.ts: (no match)
packages/opencode/src/provider/transform.ts: 5:@opencode-ai/core/models-dev, 1481:providerID === "opencode", 1611:startsWith("opencode") — all in base
packages/opencode/src/session/prompt.ts: @opencode-ai/* imports + "@opencode/SessionPrompt" — all in base
packages/opencode/src/command/index.ts: @opencode-ai/* — all in base

$ grep -rn http packages/opencode/src/kilocode/command/btw.ts src/kilocode/session/btw.ts src/provider/transform.ts src/session/prompt.ts
(no new URL in btw files; provider transform URLs are pre-existing ai-sdk/docs links)
```

## Limitations

- Review scoped to the 8 changed files' diff (`b1934a39266..bf2e117680`); full-repo `opencode` branding outside the diff not re-audited.
- Static-string analysis only; runtime CLI output (`kilo --help`, TUI rendering) not executed, and generated SDK/OpenAPI artifacts not rebuilt to inspect descriptions.
- `gh api` not reachable in this environment; verified via local `git diff` / `git show` which is equivalent for content but not for PR metadata/comments.
- Determination of "appropriate vs should be Kilo" for `providerID === "opencode"` assumes the upstream model-gateway identifier must remain `opencode` for routing; rebranding would be a breaking functional change, not a cosmetic one.

