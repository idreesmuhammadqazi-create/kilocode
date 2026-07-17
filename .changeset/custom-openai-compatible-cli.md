---
"@kilocode/cli": minor
---

Add a "Custom Provider (OpenAI / Anthropic compatible)" entry to `kilo auth login` and the TUI `/connect` picker. The new flow walks you through setting up a custom OpenAI- or Anthropic-compatible endpoint: pick the protocol, enter a provider id, display name, base URL, and API key. We then `GET {baseURL}/models` (or `/v1/models` for Anthropic) to discover the available models and persist everything to your config and credential store. If the model discovery fails you can retry, enter model ids manually, or abort.
