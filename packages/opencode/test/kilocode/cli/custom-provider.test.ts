// kilocode_change - new file
//
// Unit tests for the custom OpenAI-/Anthropic-compatible provider flow:
//   - discoverModels HTTP behavior (200, non-OK, non-JSON, empty list)
//   - buildProviderPatch shape
//   - sanitize helpers

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { Effect } from "effect"
import {
  PROTOCOL_OPTIONS,
  buildProviderPatch,
  discoverModels,
  sanitizeModelIDsRaw,
  sanitizeModelIds,
} from "../../../src/kilocode/cli/cmd/custom-provider"

const openai = PROTOCOL_OPTIONS.find((p) => p.value === "openai-compatible")!
const anthropic = PROTOCOL_OPTIONS.find((p) => p.value === "anthropic")!

const originalFetch = globalThis.fetch
let lastUrl: string | undefined
let lastHeaders: Record<string, string> | undefined

beforeEach(() => {
  lastUrl = undefined
  lastHeaders = undefined
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  globalThis.fetch = mock(async (url: any, init?: any) => {
    lastUrl = String(url)
    lastHeaders = init?.headers as Record<string, string> | undefined
    return impl(String(url), init)
  }) as unknown as typeof fetch
}

const okJSON = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

describe("sanitizeModelIds", () => {
  it("accepts string arrays", () => {
    expect(sanitizeModelIds(["gpt-x", "gpt-y"])).toEqual(["gpt-x", "gpt-y"])
  })

  it("extracts ids from an array of objects", () => {
    expect(sanitizeModelIds([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"])
  })

  it("dedupes ids and preserves first-seen order", () => {
    expect(sanitizeModelIds([{ id: "a" }, { id: "b" }, { id: "a" }])).toEqual(["a", "b"])
  })

  it("rejects ids with bad characters", () => {
    expect(sanitizeModelIds([{ id: "ok-model" }, { id: "has space" }, { id: "bad/slash" }])).toEqual(["ok-model"])
  })

  it("returns empty for non-array input", () => {
    expect(sanitizeModelIds(null)).toEqual([])
    expect(sanitizeModelIds(undefined)).toEqual([])
    expect(sanitizeModelIds({})).toEqual([])
    expect(sanitizeModelIds("not an array")).toEqual([])
  })
})

describe("sanitizeModelIDsRaw", () => {
  it("splits on comma and whitespace", () => {
    expect(sanitizeModelIDsRaw("a, b c\td")).toEqual(["a", "b", "c", "d"])
  })

  it("dedupes", () => {
    expect(sanitizeModelIDsRaw("a, a, b")).toEqual(["a", "b"])
  })

  it("drops invalid ids", () => {
    expect(sanitizeModelIDsRaw("ok, bad id, also-bad/")).toEqual(["ok", "bad", "id"])
  })
})

describe("buildProviderPatch", () => {
  it("trims a trailing slash from baseURL", () => {
    const patch = buildProviderPatch({
      protocol: openai,
      providerID: "my",
      name: "My",
      baseURL: "https://api.example.com/v1/",
      modelIDs: ["a", "b"],
    })
    expect(patch.options.baseURL).toBe("https://api.example.com/v1")
    expect(patch.npm).toBe("@ai-sdk/openai-compatible")
    expect(patch.models).toEqual({ a: { name: "a" }, b: { name: "b" } })
  })

  it("uses @ai-sdk/anthropic for the anthropic protocol", () => {
    const patch = buildProviderPatch({
      protocol: anthropic,
      providerID: "anthropic-foo",
      name: "Anthropic Foo",
      baseURL: "https://anthropic-foo.example.com",
      modelIDs: ["claude-x"],
    })
    expect(patch.npm).toBe("@ai-sdk/anthropic")
  })
})

describe("discoverModels (HTTP)", () => {
  it("hits the OpenAI path and parses the data array", async () => {
    mockFetch((url) => okJSON({ data: [{ id: "gpt-x" }, { id: "gpt-y" }] }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://api.example.com/v1/", apiKey: "sk-test", protocol: openai }),
    )
    expect(result).toEqual({ kind: "ok", ids: ["gpt-x", "gpt-y"] })
    expect(lastUrl).toBe("https://api.example.com/v1/models")
    expect(lastHeaders?.Authorization).toBe("Bearer sk-test")
    expect(lastHeaders?.Accept).toBe("application/json")
  })

  it("hits the Anthropic path with /v1/models", async () => {
    mockFetch((url) => okJSON({ data: [{ id: "claude-x" }] }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://anthropic.example.com", apiKey: "sk-test", protocol: anthropic }),
    )
    expect(result).toEqual({ kind: "ok", ids: ["claude-x"] })
    expect(lastUrl).toBe("https://anthropic.example.com/v1/models")
  })

  it("omits the Authorization header when the key is empty", async () => {
    mockFetch((url) => okJSON({ data: [{ id: "local-model" }] }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "http://localhost:11434/v1", apiKey: "", protocol: openai }),
    )
    expect(result.kind).toBe("ok")
    expect(lastHeaders?.Authorization).toBeUndefined()
  })

  it("returns error on non-2xx", async () => {
    mockFetch(() => new Response("nope", { status: 401, statusText: "Unauthorized" }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://api.example.com/v1", apiKey: "k", protocol: openai }),
    )
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("401")
      expect(result.message).toContain("/models")
    }
  })

  it("returns error on non-JSON body", async () => {
    mockFetch(() => new Response("<html>oops</html>", { status: 200 }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://api.example.com/v1", apiKey: "k", protocol: openai }),
    )
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message.toLowerCase()).toContain("non-json")
    }
  })

  it("returns error when the model list is empty", async () => {
    mockFetch(() => okJSON({ data: [] }))
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://api.example.com/v1", apiKey: "k", protocol: openai }),
    )
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("No models")
    }
  })

  it("returns error on network failure", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const result = await Effect.runPromise(
      discoverModels({ baseURL: "https://api.example.com/v1", apiKey: "k", protocol: openai }),
    )
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("ECONNREFUSED")
    }
  })
})
