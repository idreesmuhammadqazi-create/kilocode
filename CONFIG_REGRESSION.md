# CONFIG REGRESSION REVIEW — PR #13414 `feat/btw-ephemeral-fork`

**Branch:** `review/pr-13414-btw` @ `bf2e117680` · **Base:** `b1934a39266e6114a7cae0d8104b8c87df20fb80` · **Date:** 2026-08-25
**Scope:** Verify PR does not re-introduce `opencode` config directory/file fallback or break `.kilo`-only lookup.

## Scope / Methodology

- Diff base..head: `git diff --name-only` / `--stat` / full diff — confirmed 8 files changed (see outputs). Zero files under `packages/opencode/src/config/` touched — verified via `git diff -- packages/opencode/src/config/` and `git log --oneline base..head -- packages/opencode/src/config/`.
- Grepped changed files for `opencode`, `.kilo`, `.opencode`, `config`, `xdg` (see outputs). Grepped full diff for same terms. Inspected `packages/opencode/src/session/prompt.ts` and `packages/opencode/src/provider/transform.ts` diffs for any config handling (path resolution, discovery, `Global.Path`, `ConfigPaths`, `loadGlobal`, `loadInstanceState`).
- Inspected on-disk config discovery still enforces `.kilo`-only: `packages/opencode/src/config/paths.ts` (`targets: [".kilocode", ".kilo"]`), `packages/opencode/src/config/config.ts` (global candidates, `ConfigPaths.files/directories`, `primaryPaths`, `loadGlobal`/`loadInstanceState`). Checked `Global.Path.config` / XDG usage not altered.
- Checked that `.kilo`-only stripping is unrelated to PR's functional area (BTW ephemeral fork).

## Findings

**No config regression found — PASS.**

- **No config files changed.** Changed set is `.changeset/btw-ephemeral-fork.md`, `packages/opencode/src/command/index.ts`, `packages/opencode/src/kilocode/command/btw.ts`, `packages/opencode/src/kilocode/session/btw.ts`, `packages/opencode/src/provider/transform.ts`, `packages/opencode/src/session/prompt.ts`, plus two `btw` tests. No `config.ts`/`paths.ts`/`markdown.ts`/`tui.ts` edits.
- **No new/restored `opencode` config path reading.** Grep of changed files and full diff shows zero additions of `.opencode`, `opencode.json`, or `opencode.jsonc` as config sources. Only pre-existing `opencode` literals remain: `@opencode/*` imports, `providerID.startsWith("opencode")` provider routing in `transform.ts`, and `LegacyEvent` type — unrelated to filesystem config discovery.
- **No breakage of `.kilo`-only multi-path search.** PR does not remove, reorder, or filter `ConfigPaths.directories` / `ConfigPaths.files` candidates, `primaryPaths`, or the `loadGlobal` merge order (`config.json` → `kilo.json`/`kilo.jsonc` → `opencode.json`/`opencode.jsonc` for global XDG only — intentional Kilo compatibility retained, not expanded). The `for (const name of ["kilo","opencode"])` project-file loop and `targets: [".kilocode",".kilo"]` directory walk are untouched.
- **Provider/prompt changes are cache-key only, not config.** `transform.ts` change replaces `input.sessionID` with `cacheKey = __KILO_BTW_OVERRIDES__.get(sessionID) ?? sessionID` for `promptCacheKey`/`prompt_cache_key` — prompt cache routing for BTW forks. `prompt.ts` adds `KiloBtw` fork/list/format logic and `handleBtw` — no `Config` path, `Global.Path`, or `xdg` handling introduced. `command/index.ts` only registers `commands["btw"] = btwCommand()`.

### Human verification (precautionary)

- **Global fallback retention is intentional — not a PR regression but confirm desired.** `config.ts:loadGlobal` still merges `Global.Path.config/opencode.json{,c}` after `kilo.json{,c}` (lines 403-404). Verify this remains intended for XDG migration compatibility vs. fully `.kilo`-only. PR does not expand it to project dirs.
- **BTW `Storage`/`globalThis` isolation — not config but confirm no cross-session config bleed.** `KiloeBtw` uses `Storage.Service` key `["btw", parentID]` and `globalThis.__KILO_BTW_OVERRIDES__` map for promptCacheKey. Human should confirm fork `sessions.fork`/`sessions.remove` + `clearPromptCacheOverride` + `clearPlatformOverride` ordering cannot leave stale overrides that alias a future sessionID.
- **No config-variable expansion path touched, but `KiloBtw` stores raw question/answer — confirm trusted/untrusted boundary unaffected.** BTW persists via same `Storage`, not `Config`.

## Notable Non-Findings

- No upstream `config` discovery additions that would need stripping — PR is pure Kilo-owned `kilocode/` plus isolated `transform`/`prompt` BTW logic.
- No `xdg` / `XDG_CONFIG_HOME` / `Global.Path` edits.
- No `.opencode` directory fallback reintroduced (project walk remains `[".kilocode",".kilo"]`).
- No change to `tui-migrate` / `ConfigPaths.fileInDirectory(Global.Path.config, "kilo")` etc.

## Command Outputs (abridged)

```
$ git diff --name-only b1934a39..bf2e1176
.changeset/btw-ephemeral-fork.md
packages/opencode/src/command/index.ts
packages/opencode/src/kilocode/command/btw.ts
packages/opencode/src/kilocode/session/btw.ts
packages/opencode/src/provider/transform.ts
packages/opencode/src/session/prompt.ts
packages/opencode/test/kilocode/session/btw-integration.test.ts
packages/opencode/test/kilocode/session/btw.test.ts

$ git diff --stat b1934a39..bf2e1176
 8 files changed, 538 insertions(+), 4 deletions(-)

$ git diff b1934a39..bf2e1176 -- packages/opencode/src/config/  → (empty)
$ git log --oneline b1934a39..bf2e1176 -- packages/opencode/src/config/ → (empty)
$ grep -rn "opencode|\.kilo|config|xdg" packages/opencode/src/config/paths.ts → targets: [".kilocode", ".kilo"]
$ grep diff for opencode/config/xdg in changed files → no config-path matches; only @opencode imports & providerID opencode branch
$ grep -n "kilocode_change" packages/opencode/src/config/paths.ts → lines 29,35 retained
```

Full verification commands run: `git rev-parse`, `git diff --name-only/--stat`, `git diff` greps, `ls packages/opencode/src/config/`, `grep -rn` in config dir, `cat paths.ts`/`config.ts` candidate sections.

## Limitations

- Static diff/grep review only; no runtime exercising of `Config.loadInstanceState` or XDG expansion. Relies on `Global.Path` implementation not inspected beyond config package.
- Search scoped to changed files + `packages/opencode/src/config/` — transitive `Global.Path` consumers outside diff not enumerated (per "no exhaustive files checked" instruction).
- Provider `transform` BTW override uses direct `globalThis` access rather than `KiloBtw.resolvePromptCacheKey()` helper — functional but divergent; not a config regression.
