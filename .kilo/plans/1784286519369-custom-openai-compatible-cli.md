# Plan: Add a Custom OpenAI-/Anthropic-Compatible Provider entry to the CLI

## Goal

Let a CLI user add a custom OpenAI- or Anthropic-compatible provider from inside the app — no hand-editing `kilo.jsonc`. Mirror what the VS Code extension already exposes via its `CustomProviderDialog` (`packages/kilo-vscode/webview-ui/src/components/settings/CustomProviderDialog.tsx`) and wire it into the same `kilo auth login` provider list and the TUI `/connect` dialog the built-in providers use. Discover available models by `GET {baseURL}/models`. Store the API key in the existing `~/.local/share/kilo/auth.json` (`packages/opencode/src/auth/index.ts:73-81`), store the provider config in the existing `~/.config/kilo/kilo.jsonc` via `Config.Service.updateGlobal`.

## User-facing flow

```
kilo auth login                 <-- new top-level entry, "Custom Provider (OpenAI / Anthropic compatible)"
  /connect                      <-- same entry in the TUI dialog

  -> pick protocol: OpenAI-compatible | Anthropic-compatible
  -> enter provider id            (a-z, 0-9, hyphens; strip @ai-sdk/ prefix)
  -> enter display name           (default = provider id)
  -> enter base URL               (must start with http:// or https://)
  -> enter API key                (masked; required)
  -> fetch GET {baseURL}/models   (with Authorization: Bearer <key> if non-empty)
     success                       -> dedupe + sanitize ids, save
     failure                       -> retry | enter ids manually | abort
  -> save: Auth.set(id, { type:"api", key })  +  Config.updateGlobal({ provider: { [id]: patch } })
  -> (TUI only) instance.dispose() + sync.bootstrap(), then jump to model picker (DialogModel)
```

## Key design decisions (locked)

| Decision | Choice |
|---|---|
| Surface area | Add to **both** `kilo auth login` provider autocomplete (`packages/opencode/src/cli/cmd/providers.ts:390-412`) and TUI `/connect` (`packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx:42-63,241-244`) |
| Picker entry | Single combined entry "Custom Provider (OpenAI / Anthropic compatible)" at the top of the list (priority 8). Protocol is asked as the first form step. |
| API key storage | Use existing `Auth.Service.set` → `~/.local/share/kilo/auth.json` — same destination as every other provider. No key in `kilo.jsonc`. |
| Model discovery | `GET {baseURL}/models` with `Authorization: Bearer <key>` header. Bearer is omitted if the user enters an empty key (rare). |
| Failure recovery | `@clack/prompts select` with **Retry / Enter model IDs manually / Abort**. "Manually" opens a `text` prompt for comma- or whitespace-separated ids. "Abort" discards both the partial config patch and the auth record and returns to the picker. |
| Caching | **No cache.** Re-fetch every time. |
| Per-model config shape | Match the extension's `serializeModel` shape (`packages/kilo-vscode/webview-ui/src/components/settings/CustomProviderValidation.ts:140-148`): `{ name, reasoning?, modalities?, variants? }`. For our discovery feed, only `name` is populated (the model id). Reasoning/modality/variants are `undefined` and left to be hand-edited in `kilo.jsonc`. Drop entries whose id fails `ProviderV2.ID` regex. |
| Post-save UX (TUI) | Hot-reload: `sdk.client.instance.dispose()` → `sync.bootstrap()` → reopen dialog as `DialogModel providerID={id}` (same pattern as the existing OAuth path at `dialog-provider.tsx:277-294`). |

## Affected files

| Concern | File | Action |
|---|---|---|
| Provider autocomplete | `packages/opencode/src/cli/cmd/providers.ts` | Add one priority-8 option `{ label: "Custom Provider (OpenAI / Anthropic compatible)", value: "custom-compatible" }` to the options array at lines 390-412, ahead of the existing `"other"` entry at line 432. Branch on `provider === "custom-compatible"` at line 443 to call the new flow. |
| New flow module | `packages/opencode/src/cli/cmd/custom-provider.ts` (new) | Effect-based sub-flow: protocol pick → id/name/url/key prompts → `discoverModels` → save. Reuses `@clack/prompts` via `packages/opencode/src/cli/effect/prompt.ts`. |
| Model discovery helper | `packages/opencode/src/cli/cmd/custom-provider-models.ts` (new) | `discoverModels(baseURL, apiKey, npm): Effect<{ ids: string[] } \| { error: { status: number; body: string } }>`. Uses `fetch`, 10s timeout via `AbortSignal.timeout(10_000)`. OpenAI-compatible: `GET {baseURL}/models`. Anthropic-compatible: `GET {baseURL}/v1/models` (Anthropic exposes the same shape). |
| TUI provider list | `packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx` | Add a `custom` type entry `{ type: "custom-compatible", title: "Custom Provider (OpenAI / Anthropic compatible)", value: "__custom_compatible__", category: "Popular" }` to `providerOptions()` at lines 42-63. Handle the new value in the auth-method flow at lines 141-166 by branching to a new `DialogCustomCompatible` component. |
| TUI dialog component | `packages/opencode/src/cli/cmd/tui/component/dialog-custom-compatible.tsx` (new) | SolidJS form: protocol `DialogSelect` (OpenAI / Anthropic) → id/name/url `DialogPrompt` fields → api key `DialogPrompt` (masked via existing `DialogPrompt` placeholder) → discover → on success call `sdk.client.config.update({...})` + `sdk.client.auth.set({...})` → `sdk.client.instance.dispose()` + `sync.bootstrap()` → `dialog.replace(() => <DialogModel providerID={id} />)`. On failure, same Retry/Manual/Abort `DialogSelect`. |

## New flow (non-TUI CLI) — exact behavior

```
Cli.customProvider.run() yields:
  1. Prompt.select  "Protocol" ["OpenAI-compatible", "Anthropic-compatible"]
     -> npm = "@ai-sdk/openai-compatible" | "@ai-sdk/anthropic"

  2. Prompt.text    "Provider id"
     validate: /^[a-z0-9-]+$/
     strip leading "@ai-sdk/"
     reject ids that already exist in cfg.provider (use Config.updateGlobal first to read, then merge)

  3. Prompt.text    "Display name"   default = id
     validate: trim().min(1).max(200)

  4. Prompt.text    "Base URL"   (placeholder e.g. https://api.example.com/v1)
     validate: startsWith http:// or https://

  5. Prompt.password "API key"  required

  6. models = discoverModels(url, key, npm)
     if .error:
       Prompt.select ["Retry", "Enter model ids manually", "Abort"]
         Retry  -> goto 6
         Manual -> Prompt.text "Model ids (comma- or space-separated)" -> split/trim/dedupe/filter ID regex -> goto 7
         Abort  -> return, do NOT save anything

  7. Build patch:
     {
       npm,
       name,
       options: { baseURL: url, ...(headers ? { headers } : {}) },
       models: Object.fromEntries(models.map(id => [id, { name: id }]))
     }

  8. Auth.Service.set(id, { type: "api", key })
        -> persists to ~/.local/share/kilo/auth.json

  9. Config.Service.updateGlobal({ provider: { [id]: patch } }, { dispose: false })
        -> persists to kilo.jsonc
        -> server endpoints already dispose instances after global config changes
           (packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts:96-105)

 10. Prompt.log.success "Added provider <id>"
     Prompt.outro "Done"
```

Headers (provider-level custom headers) are not asked in this flow. The extension supports them via `options.headers`; we leave that as a hand-edit for now.

## New flow (TUI `/connect`) — exact behavior

```
/connect
  -> DialogProvider
  -> select "Custom Provider (OpenAI / Anthropic compatible)"
  -> DialogCustomCompatible (new)
     protocol select -> id/name/url/key prompts (DialogPrompt)
     -> sdk.client.config.update({ config: { provider: { [id]: patch }, disabled_providers: filterOut(id) } })
     -> sdk.client.auth.set({ providerID: id, auth: { type: "api", key } })
     -> sdk.client.instance.dispose() + sync.bootstrap()
     -> dialog.replace(() => <DialogModel providerID={id} />)
```

Discovery error mirrors the non-TUI path: the dialog shows the Retry/Manual/Abort select, re-uses the same `discoverModels` helper.

## Why no extension of the existing "Other" entry

`packages/opencode/src/cli/cmd/providers.ts:443-460` already has an `"other"` branch that **only stores a credential** and warns the user to hand-edit `kilo.json`. We are deliberately leaving that path intact for users who already have a custom provider in `kilo.json` and only need a credential. The new entry is the "I have nothing yet, set it all up for me" path.

## Why no `kilo providers add` subcommand

You explicitly chose to wire this into the existing `kilo auth login` and TUI `/connect` entry points. No new top-level command.

## Validation plan

1. Unit test for `discoverModels`:
   - `bun test ./test/cli/custom-provider-models.test.ts` (new) — covers 200 + happy parse, 401/404/500, timeout, non-JSON body, empty `data` array, ids with bad characters.
2. Unit test for the patch builder:
   - `bun test ./test/cli/custom-provider.test.ts` (new) — covers dedupe, id-strip, headers passthrough, both npm values.
3. End-to-end smoke (manual):
   - `bun run dev` and run `kilo auth login`, pick the new entry, walk through with a known public OpenAI-compatible endpoint (e.g. a local Ollama instance at `http://localhost:11434/v1`). Verify:
     - `~/.local/share/kilo/auth.json` contains the new entry.
     - `~/.config/kilo/kilo.jsonc` (or `opencode.jsonc`) contains `provider.<id>` with `options.baseURL` and `models`.
     - `/models` in the TUI lists the discovered ids.
     - `/connect` in the TUI shows the new entry; same flow saves and lands in `DialogModel`.
4. Type/lint:
   - `bun run typecheck` from `packages/opencode/`.
   - `bun run lint`.
5. Knip:
   - `bun run knip` from `packages/kilo-vscode/` (unaffected — no changes there).

## Out of scope

- Multi-model advanced fields (`reasoning`, `modalities`, `cost`, `limit`, `variants`) — model entries are `{ name: id }` only.
- Custom provider-level `headers` in the prompt flow — hand-edit `kilo.jsonc`.
- OAuth against custom endpoints — API key only.
- Editing / deleting an existing custom provider via this UI — `kilo auth logout <id>` works for the credential; provider config must be hand-edited (matches current behavior for built-ins).
- Caching the model list.

## Open questions

None.
