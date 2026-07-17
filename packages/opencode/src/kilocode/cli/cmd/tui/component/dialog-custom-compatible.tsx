// kilocode_change - new file
//
// TUI version of the custom OpenAI-/Anthropic-compatible provider flow.
// Mirrors `packages/opencode/src/kilocode/cli/cmd/custom-provider.ts` for the
// non-TUI `kilo auth login` path. The SolidJS/OpenTUI dialog drives the same
// protocol -> id -> name -> baseURL -> apiKey -> discover -> save sequence
// and then hot-reloads the running instance the same way the built-in
// `ApiMethod` does.

import { createSignal, Show } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { TextAttributes } from "@opentui/core"
import { DialogModel } from "@tui/component/dialog-model"
import { errorMessage } from "@/util/error"

type Protocol = "openai-compatible" | "anthropic"

type DiscoveredModels =
  | { kind: "ok"; ids: string[] }
  | { kind: "error"; message: string }

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]*$/

function trimSlash(url: string) {
  return url.replace(/\/+$/, "")
}

function sanitizeModelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const id = typeof item === "string" ? item : item && typeof item === "object" ? (item as any).id : undefined
    if (typeof id !== "string") continue
    const trimmed = id.trim()
    if (!trimmed || !MODEL_ID_RE.test(trimmed)) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function sanitizeModelIDsRaw(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of input.split(/[\s,]+/)) {
    const trimmed = part.trim()
    if (!trimmed || !MODEL_ID_RE.test(trimmed)) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

async function discoverModels(
  baseURL: string,
  apiKey: string,
  protocol: Protocol,
): Promise<DiscoveredModels> {
  const path = protocol === "openai-compatible" ? "/models" : "/v1/models"
  const url = trimSlash(baseURL) + path
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`

  let res: Response
  let body: string
  try {
    res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) })
    body = await res.text()
  } catch (err) {
    return { kind: "error", message: errorMessage(err) }
  }
  if (!res.ok) {
    return { kind: "error", message: `${res.status} ${res.statusText || "response"} from ${url}` }
  }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch (err) {
    return { kind: "error", message: `Non-JSON response from ${url}: ${errorMessage(err)}` }
  }
  const ids = sanitizeModelIds((json as { data?: unknown })?.data ?? json)
  if (ids.length === 0) return { kind: "error", message: `No models found at ${url}` }
  return { kind: "ok", ids }
}

function npmFor(protocol: Protocol) {
  return protocol === "openai-compatible" ? "@ai-sdk/openai-compatible" : "@ai-sdk/anthropic"
}

async function persistAndReload(opts: {
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ReturnType<typeof useToast>
  dialog: ReturnType<typeof useDialog>
  providerID: string
  patch: Record<string, unknown>
  apiKey: string
}) {
  const { sdk, sync, toast, dialog, providerID, patch, apiKey } = opts

  const globalConfig = (await sdk.client.global.config.get({ throwOnError: true })).data ?? {}
  const disabled = (globalConfig as any).disabled_providers ?? []
  const nextDisabled = Array.isArray(disabled) ? disabled.filter((x: string) => x !== providerID) : []
  const existing = ((globalConfig as any).provider as Record<string, unknown> | undefined)?.[providerID]
  const merged = existing
    ? { ...(existing as object), ...(patch as object), models: { ...((existing as any).models ?? {}), ...(patch as any).models } }
    : patch

  const configRes = await sdk.client.global.config.update({
    config: { provider: { [providerID]: merged }, disabled_providers: nextDisabled } as any,
  })
  if (configRes.error) {
    toast.show({ variant: "error", message: errorMessage(configRes.error) })
    dialog.clear()
    return
  }

  const authRes = await sdk.client.auth.set({
    providerID,
    auth: { type: "api", key: apiKey },
  })
  if (authRes.error) {
    toast.show({ variant: "error", message: errorMessage(authRes.error) })
    dialog.clear()
    return
  }

  await sdk.client.instance.dispose()
  await sync.bootstrap()
  dialog.replace(() => <DialogModel providerID={providerID} />)
}

function recoverSelect(dialog: ReturnType<typeof useDialog>) {
  return new Promise<"retry" | "manual" | "abort" | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogSelect
          title="Could not discover models"
          options={[
            { title: "Retry", value: "retry" as const },
            { title: "Enter model ids manually", value: "manual" as const },
            { title: "Abort", value: "abort" as const },
          ]}
          onSelect={(option) => resolve(option.value as any)}
        />
      ),
      () => resolve(null),
    )
  })
}

export function DialogCustomCompatible() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()

  const [busy, setBusy] = createSignal(false)

  const pickProtocol = () =>
    new Promise<Protocol | null>((resolve) => {
      dialog.replace(
        () => (
          <DialogSelect
            title="Provider protocol"
            options={[
              { title: "OpenAI-compatible", value: "openai-compatible" as const },
              { title: "Anthropic-compatible", value: "anthropic" as const },
            ]}
            onSelect={(option) => resolve(option.value as Protocol)}
          />
        ),
        () => resolve(null),
      )
    })

  const promptProviderID = (existing: Set<string>): Promise<string | null> =>
    DialogPrompt.show(dialog, "Provider id", {
      placeholder: "my-provider",
      description: () => (
        <text fg={theme.textMuted}>
          Lowercase letters, numbers, and hyphens. Must be unique.
        </text>
      ),
    }).then((value): Promise<string | null> => {
      if (value === null) return Promise.resolve(null)
      const id = value.replace(/^@ai-sdk\//, "").trim()
      if (!PROVIDER_ID_RE.test(id)) {
        toast.show({
          variant: "error",
          message:
            "Provider id must start with a lowercase letter or number and use only lowercase letters, numbers, and hyphens",
        })
        return promptProviderID(existing)
      }
      if (existing.has(id)) {
        toast.show({ variant: "error", message: `Provider "${id}" already exists` })
        return promptProviderID(existing)
      }
      return Promise.resolve(id)
    })

  const promptName = (id: string): Promise<string | null> =>
    DialogPrompt.show(dialog, "Display name", { placeholder: id }).then((value): Promise<string | null> => {
      if (value === null) return Promise.resolve(null)
      const trimmed = value.trim()
      return Promise.resolve(trimmed || id)
    })

  const promptURL = (): Promise<string | null> =>
    DialogPrompt.show(dialog, "Base URL", {
      placeholder: "https://api.example.com/v1",
      description: () => (
        <text fg={theme.textMuted}>
          The endpoint must expose {`{base}/models`} (OpenAI) or {`{base}/v1/models`} (Anthropic).
        </text>
      ),
    }).then((value): Promise<string | null> => {
      if (value === null) return Promise.resolve(null)
      const trimmed = value.trim()
      if (!/^https?:\/\//.test(trimmed)) {
        toast.show({ variant: "error", message: "URL must start with http:// or https://" })
        return promptURL()
      }
      return Promise.resolve(trimmed)
    })

  const promptAPIKey = (): Promise<string | null> =>
    DialogPrompt.show(dialog, "API key", { placeholder: "API key" }).then((value): Promise<string | null> => {
      if (value === null) return Promise.resolve(null)
      if (!value.trim()) {
        toast.show({ variant: "error", message: "API key is required" })
        return promptAPIKey()
      }
      return Promise.resolve(value.trim())
    })

  const promptManualModels = (): Promise<string[] | null> =>
    DialogPrompt.show(dialog, "Model ids", {
      placeholder: "model-a, model-b, model-c",
    }).then((value): Promise<string[] | null> => {
      if (value === null) return Promise.resolve(null)
      const ids = sanitizeModelIDsRaw(value)
      if (ids.length === 0) {
        toast.show({ variant: "error", message: "Enter at least one model id" })
        return promptManualModels()
      }
      return Promise.resolve(ids)
    })

  const collectExisting = async () => {
    const globalConfig = (await sdk.client.global.config.get({ throwOnError: true })).data
    return new Set(Object.keys((globalConfig as any)?.provider ?? {}))
  }

  const run = async () => {
    const protocol = await pickProtocol()
    if (!protocol) return
    const existing = await collectExisting()
    const providerID = await promptProviderID(existing)
    if (!providerID) return
    const name = await promptName(providerID)
    if (!name) return
    const baseURL = await promptURL()
    if (!baseURL) return
    const apiKey = await promptAPIKey()
    if (!apiKey) return

    let modelIDs: string[] = []
    let attempt = 0
    while (true) {
      attempt++
      setBusy(true)
      const result = await discoverModels(baseURL, apiKey, protocol)
      setBusy(false)
      if (result.kind === "ok") {
        modelIDs = result.ids
        break
      }
      toast.show({ variant: "error", message: result.message })
      const recover = await recoverSelect(dialog)
      if (recover === null || recover === "abort") return
      if (recover === "retry") {
        if (attempt >= 5) {
          toast.show({ variant: "info", message: "Reached 5 retries" })
        } else {
          continue
        }
      }
      if (recover === "manual") {
        const ids = await promptManualModels()
        if (!ids) return
        modelIDs = ids
        break
      }
    }

    const patch = {
      npm: npmFor(protocol),
      name,
      options: { baseURL: trimSlash(baseURL) },
      models: Object.fromEntries(modelIDs.map((id) => [id, { name: id }])),
    }

    setBusy(true)
    await persistAndReload({ sdk, sync, toast, dialog, providerID, patch, apiKey })
    setBusy(false)
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Custom Provider
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted}>
        Add an OpenAI- or Anthropic-compatible endpoint. We will fetch its model list and save it for you.
      </text>
      <Show when={busy()}>
        <text fg={theme.textMuted}>Working...</text>
      </Show>
      <Show when={!busy()}>
        <text fg={theme.text} onMouseUp={() => void run()}>
          Press to start
        </text>
      </Show>
    </box>
  )
}
