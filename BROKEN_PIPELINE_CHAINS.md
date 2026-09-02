# BROKEN_PIPELINE_CHAINS — PR #13414 `feat/btw-ephemeral-fork` (bf2e117680 vs b1934a39266)

> Review focus: end-to-end chains where Kilo-specific behavior spans multiple layers. Verify every link still exists after merge; flag param/field/event/config that is set but never read (or read but never set) even if code compiles.

## Scope / Methodology

- **PR:** `review/pr-13414-btw` at `bf2e117680` ("revert: restore index.ts to base, keep PR pure btw"), base `b1934a39266e6114a7cae0d8104b8c87df20fb80`. 8 files: `.changeset/btw-ephemeral-fork.md`, `packages/opencode/src/command/index.ts`, `packages/opencode/src/kilocode/command/btw.ts`, `packages/opencode/src/kilocode/session/btw.ts`, `packages/opencode/src/provider/transform.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/test/kilocode/session/btw-integration.test.ts`, `packages/opencode/test/kilocode/session/btw.test.ts`.
- **Method:** For each `kilocode_change` trace introduced value → flow → consumption. Checked: props/params through layers, storage read/write, message types/events/IPC sender/receiver, config/flags, type definitions. Used `git show`/`git diff` for base-vs-PR, `grep -rn` for `__KILO_BTW_OVERRIDES__` spelling, `Session.fork`/`remove`/`KiloSession.clearPlatformOverride` existence, `Command.Event.Executed` publish sites, and `Storage` sync/async paths. Cross-checked provider `options()` cacheKey branches (OpenAI/Azure/Codex/xAI/Mistral/DeepInfra/Cerebras/opencode + gateway/kilo-gateway anthropic breakpoints).

## Findings

### 1 — `globalThis.__KILO_BTW_OVERRIDES__` key consistency — **PASS (no broken link, notable risk)**

Chain: `KiloBtw.setPromptCacheOverride/fork` (session/prompt.ts:2311) → `globalThis.__KILO_BTW_OVERRIDES__` (btw.ts:127 singleton `const overrides = ((globalThis as any).__KILO_BTW_OVERRIDES__ ??= new Map())`) → `provider/transform.ts` reads same key (lines 1544, 1612).

- Spelling identical across 3 sites (`grep -rn __KILO_BTW` returns same string). Singleton pattern reuses existing map if already created by previous import, preventing split-brain maps.
- **Residual risk (human verify):** `transform.ts` reads `globalThis` inline instead of `KiloBtw.resolvePromptCacheKey()` / `getPromptCacheOverride()`. If the key is ever renamed, `transform.ts` and `btw.ts` drift independently despite tests. Recommend importing helper or central const.

### 2 — `provider/transform.ts` cacheKey override coverage — **PARTIAL / GAP (human verify whether intended)**

PR injects parent-key reuse in 3 places:

- `if (setCacheKey !== false) { const cacheKey = globalThis.__KILO_BTW_OVERRIDES__.get(sessionID) ?? sessionID }` → `prompt_cache_key = cacheKey` for `@ai-sdk/deepinfra`/`@ai-sdk/cerebras`, and `promptCacheKey = cacheKey` for `@ai-sdk/openai|azure|xai|mistral|venice` + `providerID===openai && npm!==openai-compatible` + `setCacheKey===true`. (lines 1543-1557)
- `if (providerID.startsWith("opencode") && setCacheKey!==false) promptCacheKey = globalThis.get(...) ?? sessionID` (line 1611-1612) — duplicated inline read, not reusing `cacheKey` var (out of scope, separate `if`).

**Gap:** Models with `api.npm === "@kilocode/kilo-gateway"` and non-`opencode` `providerID` (e.g., Anthropic via Kilo Gateway, OpenAI via gateway wrapper) hit neither branch unless `providerOptions.setCacheKey===true`. They fall through to `supportsPromptCacheBreakpoint` → `promptCacheBreakpoint: explicit`, which Anthropic already handles via prefix caching, so lack of `promptCacheKey` reuse may be intentional. The PR comment says "OpenAI/Codex/xAI/Mistral which key by sessionID. Anthropic already hits via prefix, but reusing is still correct." — current code does not reuse for `kilo-gateway` outside `opencode` families. **Verify product intent:** should `kilo-gateway` be added to the main `promptCacheKey` branch (like `venice`)? Otherwise btw on Kilo Gateway proxied OpenAI loses cache benefit silently (compiles, no error).

Also `@ai-sdk/gateway` (generic) intentionally sets `gateway:{caching:"auto"}` regardless of sessionID — not covered, by design.

### 3 — `fork → setOverride → prompt → add → remove → clearPlatformOverride` lifecycle — **PASS with 2 notes**

Chain: `InstanceState.context` (prompt.ts:2287ish, parent directory context preserved per comment "Ensure fork/remove run with the parent's InstanceState directory") → `sessions.fork({sessionID: parentID})` (Session.Service fork exists, SessionTable parent_id, KiloSession.register) → `KiloBtw.setPromptCacheOverride(fork.id, parentID)` → `prompt({sessionID: fork.id, ...})` → `Effect.ensuring(clearOverride)` (`Effect.sync(()=>clearPromptCacheOverride)`) → `KiloBtw.add({parentID, question, answer, model, forkID})` → `Effect.sleep(300)` → `sessions.remove(fork.id)` → `Effect.sync(()=>KiloSession.clearPlatformOverride(fork.id))` → `sessions.updateMessage/updatePart` on parent + `events.publish(Command.Event.Executed, {name, sessionID: parentID, arguments, messageID})`.

- Both success and failure paths publish `Command.Event.Executed` with parent sessionID (lines 2425, 2362, 2278) — receiver is legacy Bus subscriber for `CommandExecuted`; sender matches.
- Failure path (`Exit.isFailure`) also sleeps 300ms, removes fork, clears platform override, then publishes error parent message — **clearOverride already ran via `ensuring` before removal, so transform sees parent key only during prompt, not after** — correct.
- `KiloSession.clearPlatformOverride` exists (`kilocode/session/index.ts:118`, `260`) and deletes 3 maps (overrides/parents/roots). `Session.remove` itself calls `KiloSession.removeSession` (Effect.promise) but not `clearPlatformOverride`; the extra clear in handleBtw is required and present in both branches.
- **Note 1 — timing dependency:** 300ms sleep to avoid "skipping part update for deleted session" is heuristic, not causal. Under load, fork loop may still be writing. Not a broken compile link, but a flaky chain worth replacing with `await` on prompt completion (already `Exit` ensures prompt finished, but processor may still flush). Human verify if `sessions.remove` should `Effect.retry` or `Session.cleanup` should be used.
- **Note 2 — InstanceState context:** `ctx` captured before fork, then reused after for `path: {cwd: ctx.directory, root: ctx.worktree}`. If fork mutates InstanceState (e.g., directory switch), parent message path still uses original — intentional per comment.

No missing link: `currentModel`, `getModel`, `agents.get/defaultInfo`, `Provider.parseModel` all exist.

### 4 — `Storage` vs `memFallback` sync/async chain — **PARTIAL (data-loss on reuse without Storage, silent)**

Chain: `KiloBtw.list` (Effect, reads `Storage.Service` optionally, falls back to `memFallback`, then `memFallback.set` sync) vs `listSync` (pure mem) vs `add` (Effect, reads existing from storage-or-mem, writes mem + storage) vs `addSync` (sync mem only, comment says fire-and-forget write intentionally omitted) vs `clear` (delete mem + `Storage.remove`).

- Main chain (`handleBtw` uses `yield* KiloBtw.list` and `yield* KiloBtw.add`) is correct: persists to Storage when available, else mem.
- **Broken-ish:** `addSync` never writes to Storage; any caller using it loses data on restart. Comment says "async persist is handled by `add`" but chain is incomplete if `addSync` is ever used beyond tests. `listSync` also never hydrates from Storage, so a fresh process would return empty even though Storage has entries until `list` is called once. No caller currently uses `listSync` in production (only potential UI polling), but the chain is asymmetrical. Recommend either removing `addSync`/`listSync` or making them delegate to Storage via `Effect.runSync` / `AppRuntime.runPromise`.
- `Storage.read<Entry[]>` key `["btw", parentID]` has no schema migration; file path `storage/btw/<parentID>.json` will be created lazily — exists check handled by `Effect.catch` fallback, so no throw.

### 5 — `btw` command registration chain — **PASS**

Chain: `packages/opencode/src/kilocode/command/btw.ts:btwCommand()` (`{name:"btw", hints:["$ARGUMENTS"], template:""}`) + `isBtwCommand()` → `command/index.ts` imports `btwCommand` and `commands["btw"]=btwCommand()` (line 118) → `SessionPrompt.command` handles `if(isBtwCommand(input.command)) yield* handleBtw(...)` before generic template substitution (line 2459-2462). Template is empty so `handleBtw` short-circuits before placeholder logic; no missing registration.

`BUILTIN_COMMANDS` hint not required since `btw` is inserted into `commands` map, so `commands.get("btw")` succeeds and error hint includes it.

### 6 — Prompt result extraction chain — **PASS with verification note**

`promptResult.parts.filter(p.type==="text").map(p.text).join("\n\n")` → fallback to `tool` completed `output` strings → `"[No text response]"`. Covers text-only and tool-only answers. Depends on `MessageV2.TextPart`/`ToolPart` shapes stable — they are.

### 7 — Type/event definition drift — **PASS (non-finding)**

- `KiloBtw.Entry` schema extends optional `model {providerID, modelID}` + `forkID` — consumed only via `formatEntry` and `add`; no consumer expects required field, so additive change safe.
- `Command.Event.Executed` defined as `LegacyEvent.CommandExecuted` (`command/index.ts:22`) — publisher and subscriber use same constant, no sender/receiver mismatch.

## Notable Non-Findings

- No `any` typing break: `(modelRefRaw as any).providerID` intentionally handles union of `Provider.parseModel` result shapes; fallback `modelID ?? id` covers both.
- `SESSION fork` correctly preserves `model` + `variant` + `sourceID` confinement (base change, not btw-specific) — not broken.
- Tests (`btw.test.ts` promptCache override, `btw-integration.test.ts` no-arg usage + fork-delete) exercise core chain; integration test expects `list.length===1` after delete — will pass even when LLM fails (error branch also deletes fork).

## Command Outputs (evidence)

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

$ grep -rn __KILO_BTW_OVERRIDES__ packages/opencode/src --include=*.ts
packages/opencode/src/provider/transform.ts:1544: ((globalThis as any).__KILO_BTW_OVERRIDES__ as Map<string,string>|undefined)?.get(input.sessionID) ?? input.sessionID
packages/opencode/src/provider/transform.ts:1612: ((globalThis as any).__KILO_BTW_OVERRIDES__ as Map<string,string>|undefined)?.get(input.sessionID) ?? input.sessionID
packages/opencode/src/kilocode/session/btw.ts:127: const overrides = ((globalThis as any).__KILO_BTW_OVERRIDES__ as Map<string,string>|undefined) ?? ((globalThis as any).__KILO_BTW_OVERRIDES__ = new Map<string,string>())

$ grep -n "promptCacheKey\|prompt_cache_key\|setCacheKey" packages/opencode/src/provider/transform.ts
1543: if (input.providerOptions?.setCacheKey !== false) {
1544:   const cacheKey = ...__KILO_BTW_OVERRIDES__?.get(sessionID) ?? sessionID
1546:     result["prompt_cache_key"] = cacheKey
1557:     result["promptCacheKey"] = cacheKey
1611:   if (input.model.providerID.startsWith("opencode") && setCacheKey !== false) {
1612:     result["promptCacheKey"] = ...__KILO_BTW_OVERRIDES__?.get(sessionID) ?? sessionID

$ grep -n "fork\|remove\|clearPlatformOverride\|clearPromptCacheOverride\|setPromptCacheOverride" packages/opencode/src/session/prompt.ts | head
2311: KiloBtw.setPromptCacheOverride(fork.id, parentID)
2312: const clearOverride = Effect.sync(() => KiloBtw.clearPromptCacheOverride(fork.id))
2330-2333: sessions.remove(fork.id) + KiloSession.clearPlatformOverride(fork.id) (failure branch)
2392-2395: sessions.remove(fork.id) + KiloSession.clearPlatformOverride(fork.id) (success branch)
```

Full diffs inspected via `git show b1934a39266:packages/opencode/src/provider/transform.ts` vs current and `git diff ... -- packages/opencode/src/session/prompt.ts` (handleBtw 195 lines).

## Limitations

- No live run (`bun test ./test/kilocode/session/btw*` not executed; checks are static).
- Provider coverage verified statically; actual cache-hit behavior for `kilo-gateway`/`anthropic` needs runtime confirmation with real provider config.
- `Storage` backend is file-JSON (`storage/btw/<id>.json`); concurrency between `list` and `add` (read-modify-write) not transactional — `TxReentrantLock` not used here, acceptable for low contention but not verified under parallel `/btw` invocations.
- Cross-process `globalThis` map does not survive server restart (in-memory only) — fork reuse is per-process; after restart, existing forks (should be zero) not an issue, but pattern is intentionally ephemeral.

