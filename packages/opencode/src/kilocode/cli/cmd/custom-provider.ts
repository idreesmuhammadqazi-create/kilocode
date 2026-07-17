// kilocode_change - new file
//
// Custom OpenAI-/Anthropic-compatible provider flow for `kilo auth login`.
//
// Mirrors the VS Code extension's CustomProviderDialog: ask for protocol,
// provider id, display name, base URL, and API key; then `GET {baseURL}/models`
// to discover available models; finally persist via Auth.Service.set (key) and
// Config.Service.updateGlobal (provider config). The runtime at
// `packages/opencode/src/provider/provider.ts:1416-1510` reads the resulting
// `provider.<id>` entry on the next `Provider.Service` reload and routes it
// through `BUNDLED_PROVIDERS["@ai-sdk/openai-compatible"|"@ai-sdk/anthropic"]`.

import { Effect, Option } from "effect"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import * as Prompt from "@/cli/effect/prompt"
import { UI } from "@/cli/ui"
import { errorMessage } from "@/util/error"

export const CUSTOM_PROVIDER_VALUE = "__kilo_custom_compatible__"

export const PROTOCOL_OPTIONS = [
  {
    label: "OpenAI-compatible",
    value: "openai-compatible",
    npm: "@ai-sdk/openai-compatible",
    modelsPath: "/models",
  },
  {
    label: "Anthropic-compatible",
    value: "anthropic",
    npm: "@ai-sdk/anthropic",
    // Anthropic-compatible gateways expose OpenAI-style /v1/models.
    modelsPath: "/v1/models",
  },
] as const

export type Protocol = (typeof PROTOCOL_OPTIONS)[number]["value"]

export type DiscoveredModels =
  | { kind: "ok"; ids: string[] }
  | { kind: "error"; message: string }

export type ProtocolChoice = (typeof PROTOCOL_OPTIONS)[number]

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i

function trimSlash(url: string) {
  return url.replace(/\/+$/, "")
}

export function sanitizeModelIds(raw: unknown): string[] {
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

/**
 * Fetch available model ids from `{baseURL}{modelsPath}`. The endpoint is
 * expected to return either `{ data: [{ id }, ...] }` (OpenAI) or
 * `{ data: [{ id }, ...] }` (Anthropic gateway style).
 *
 * Authorization header is omitted when `apiKey` is empty.
 */
export const discoverModels = Effect.fn("Cli.customProvider.discoverModels")(function* (input: {
  baseURL: string
  apiKey: string
  protocol: ProtocolChoice
}) {
  const url = trimSlash(input.baseURL) + input.protocol.modelsPath
  const headers: Record<string, string> = { Accept: "application/json" }
  if (input.apiKey) headers["Authorization"] = `Bearer ${input.apiKey}`

  const fetched = yield* Effect.promise(() =>
    (async () => {
      try {
        const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) })
        const body = await res.text()
        return { ok: true as const, res, body }
      } catch (err) {
        return { ok: false as const, error: errorMessage(err) }
      }
    })(),
  )

  if (!fetched.ok) {
    return { kind: "error", message: fetched.error } as DiscoveredModels
  }
  const { res, body } = fetched
  if (!res.ok) {
    return {
      kind: "error",
      message: `${res.status} ${res.statusText || "response"} from ${url}`,
    } as DiscoveredModels
  }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch (err) {
    return {
      kind: "error",
      message: `Non-JSON response from ${url}: ${errorMessage(err)}`,
    } as DiscoveredModels
  }
  const ids = sanitizeModelIds((json as { data?: unknown })?.data ?? json)
  if (ids.length === 0) {
    return { kind: "error", message: `No models found at ${url}` } as DiscoveredModels
  }
  return { kind: "ok", ids } as DiscoveredModels
})

export type BuildPatchInput = {
  protocol: ProtocolChoice
  providerID: string
  name: string
  baseURL: string
  modelIDs: string[]
}

export function buildProviderPatch(input: BuildPatchInput) {
  const trimmedBase = trimSlash(input.baseURL)
  return {
    npm: input.protocol.npm,
    name: input.name,
    options: { baseURL: trimmedBase },
    models: Object.fromEntries(input.modelIDs.map((id) => [id, { name: id }])),
  }
}

export function parseManualModelIDs(input: string): string[] {
  return sanitizeModelIDsRaw(input)
}

export function sanitizeModelIDsRaw(input: string): string[] {
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

/**
 * Run the interactive custom-provider flow. Returns the provider id on success
 * or `undefined` when the user cancels/aborts.
 */
export const runCustomProviderFlow = Effect.fn("Cli.customProvider.run")(function* (existingIDs: Set<string>) {
  UI.empty()
  yield* Prompt.intro("Custom provider")

  const protocolChoice = yield* Prompt.select({
    message: "Provider protocol",
    options: PROTOCOL_OPTIONS.map((p) => ({ label: p.label, value: p.value })),
  })
  if (Option.isNone(protocolChoice)) return undefined
  const protocol = PROTOCOL_OPTIONS.find((p) => p.value === protocolChoice.value)
  if (!protocol) return undefined

  const rawID = yield* Prompt.text({
    message: "Provider id",
    placeholder: "my-provider",
    validate: (v) => {
      const id = (v ?? "").replace(/^@ai-sdk\//, "").trim()
      if (!id) return "Required"
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return "a-z, 0-9 and hyphens only (must start with a letter or number)"
      if (existingIDs.has(id)) return `"${id}" already exists`
      return undefined
    },
  })
  if (Option.isNone(rawID)) return undefined
  const providerID = rawID.value.replace(/^@ai-sdk\//, "").trim()

  const namePrompt = yield* Prompt.text({
    message: "Display name",
    placeholder: providerID,
    validate: (v) => ((v ?? "").trim().length > 0 ? undefined : "Required"),
  })
  if (Option.isNone(namePrompt)) return undefined
  const name = namePrompt.value.trim() || providerID

  const baseURLPrompt = yield* Prompt.text({
    message: "Base URL",
    placeholder: "https://api.example.com/v1",
    validate: (v) => {
      const trimmed = (v ?? "").trim()
      if (!trimmed) return "Required"
      if (!/^https?:\/\//.test(trimmed)) return "Must start with http:// or https://"
      return undefined
    },
  })
  if (Option.isNone(baseURLPrompt)) return undefined
  const baseURL = baseURLPrompt.value.trim()

  const apiKeyPrompt = yield* Prompt.password({
    message: "API key",
    validate: (v) => ((v ?? "").length > 0 ? undefined : "Required"),
  })
  if (Option.isNone(apiKeyPrompt)) return undefined
  const apiKey = apiKeyPrompt.value

  let modelIDs: string[] = []
  let attempt = 0
  while (true) {
    attempt++
    const spinner = Prompt.spinner()
    yield* spinner.start(`Fetching models from ${trimSlash(baseURL)}${protocol.modelsPath}...`)
    const result = yield* discoverModels({ baseURL, apiKey, protocol })
    if (result.kind === "ok") {
      yield* spinner.stop(`${result.ids.length} model${result.ids.length === 1 ? "" : "s"} found`)
      modelIDs = result.ids
      break
    }
    yield* spinner.stop(`Failed: ${result.message}`, 1)

    const recover = yield* Prompt.select({
      message: "Could not discover models",
      options: [
        { label: "Retry", value: "retry" },
        { label: "Enter model ids manually", value: "manual" },
        { label: "Abort", value: "abort" },
      ],
    })
    if (Option.isNone(recover) || recover.value === "abort") return undefined
    if (recover.value === "retry") {
      if (attempt >= 5) {
        yield* Prompt.log.warn("Reached 5 retries")
      } else {
        continue
      }
    }
    if (recover.value === "manual") {
      const manual = yield* Prompt.text({
        message: "Model ids",
        placeholder: "model-a, model-b, model-c",
        validate: (v) => {
          const ids = sanitizeModelIDsRaw(v ?? "")
          if (ids.length === 0) return "Enter at least one model id"
          for (const id of ids) {
            if (!MODEL_ID_RE.test(id)) return `Invalid model id "${id}"`
          }
          return undefined
        },
      })
      if (Option.isNone(manual)) return undefined
      modelIDs = sanitizeModelIDsRaw(manual.value)
      if (modelIDs.length === 0) return undefined
      break
    }
  }

  const patch = buildProviderPatch({ protocol, providerID, name, baseURL, modelIDs })

  const authSvc = yield* Auth.Service
  const cfgSvc = yield* Config.Service

  yield* Effect.orDie(authSvc.set(providerID, { type: "api", key: apiKey }))
  yield* Effect.orDie(
    cfgSvc.updateGlobal({ provider: { [providerID]: patch } } as Config.Info, { dispose: false }),
  )

  yield* Prompt.log.success(`Added provider "${name}" (${modelIDs.length} models)`)
  yield* Prompt.outro("Done")
  return providerID
})
