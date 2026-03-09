import { For } from "solid-js"
import { createStore } from "solid-js/store"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { showToast } from "@kilocode/kilo-ui/toast"
import { useLanguage } from "../../context/language"
import { useConfig } from "../../context/config"
import { useProvider } from "../../context/provider"
import { useVSCode } from "../../context/vscode"

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
const DOCS_URL = "https://kilo.ai/docs/providers/#custom-provider"

type ModelRow = { id: string; name: string }
type HeaderRow = { key: string; value: string }

type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelRow[]
  headers: HeaderRow[]
  saving: boolean
}

type FormErrors = {
  providerID: string | undefined
  name: string | undefined
  baseURL: string | undefined
  models: Array<{ id?: string; name?: string }>
  headers: Array<{ key?: string; value?: string }>
}

export function DialogCustomProvider() {
  const dialog = useDialog()
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const provider = useProvider()
  const vscode = useVSCode()

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [{ id: "", name: "" }],
    headers: [{ key: "", value: "" }],
    saving: false,
  })

  const [errors, setErrors] = createStore<FormErrors>({
    providerID: undefined,
    name: undefined,
    baseURL: undefined,
    models: [{}],
    headers: [{}],
  })

  const addModel = () => {
    setForm("models", (v) => [...v, { id: "", name: "" }])
    setErrors("models", (v) => [...v, {}])
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm("models", (v) => v.filter((_, i) => i !== index))
    setErrors("models", (v) => v.filter((_, i) => i !== index))
  }

  const addHeader = () => {
    setForm("headers", (v) => [...v, { key: "", value: "" }])
    setErrors("headers", (v) => [...v, {}])
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm("headers", (v) => v.filter((_, i) => i !== index))
    setErrors("headers", (v) => v.filter((_, i) => i !== index))
  }

  function validate() {
    const t = language.t
    const id = form.providerID.trim()
    const name = form.name.trim()
    const baseURL = form.baseURL.trim()
    const apiKey = form.apiKey.trim()

    const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
    const key = apiKey && !env ? apiKey : undefined

    const idError = !id
      ? t("provider.custom.error.providerID.required")
      : !PROVIDER_ID.test(id)
        ? t("provider.custom.error.providerID.format")
        : undefined

    const nameError = !name ? t("provider.custom.error.name.required") : undefined
    const urlError = !baseURL
      ? t("provider.custom.error.baseURL.required")
      : !/^https?:\/\//.test(baseURL)
        ? t("provider.custom.error.baseURL.format")
        : undefined

    const disabledProviders = config().disabled_providers ?? []
    const existingIDs = new Set(Object.keys(provider.providers()))
    const disabled = disabledProviders.includes(id)
    const existsError = idError
      ? undefined
      : existingIDs.has(id) && !disabled
        ? t("provider.custom.error.providerID.exists")
        : undefined

    const seenModels = new Set<string>()
    const modelErrors = form.models.map((m) => {
      const mid = m.id.trim()
      const idErr = !mid
        ? t("provider.custom.error.required")
        : seenModels.has(mid)
          ? t("provider.custom.error.duplicate")
          : (() => {
              seenModels.add(mid)
              return undefined
            })()
      const nameErr = !m.name.trim() ? t("provider.custom.error.required") : undefined
      return { id: idErr, name: nameErr }
    })

    const seenHeaders = new Set<string>()
    const headerErrors = form.headers.map((h) => {
      const hkey = h.key.trim()
      const hval = h.value.trim()
      if (!hkey && !hval) return {}
      const keyErr = !hkey
        ? t("provider.custom.error.required")
        : seenHeaders.has(hkey.toLowerCase())
          ? t("provider.custom.error.duplicate")
          : (() => {
              seenHeaders.add(hkey.toLowerCase())
              return undefined
            })()
      const valErr = !hval ? t("provider.custom.error.required") : undefined
      return { key: keyErr, value: valErr }
    })

    const next: FormErrors = {
      providerID: idError ?? existsError,
      name: nameError,
      baseURL: urlError,
      models: modelErrors,
      headers: headerErrors,
    }
    setErrors(next)

    const ok =
      !idError &&
      !existsError &&
      !nameError &&
      !urlError &&
      modelErrors.every((m) => !m.id && !m.name) &&
      headerErrors.every((h) => !h.key && !h.value)

    if (!ok) return undefined

    const headers = Object.fromEntries(
      form.headers
        .map((h) => ({ key: h.key.trim(), value: h.value.trim() }))
        .filter((h) => !!h.key && !!h.value)
        .map((h) => [h.key, h.value]),
    )

    const options: Record<string, unknown> = { baseURL }
    if (Object.keys(headers).length) options.headers = headers

    return {
      providerID: id,
      name,
      key,
      env,
      config: {
        npm: OPENAI_COMPATIBLE,
        name,
        ...(env ? { env: [env] } : {}),
        options,
        models: Object.fromEntries(form.models.map((m) => [m.id.trim(), { name: m.name.trim() }])),
      },
    }
  }

  function save(e: SubmitEvent) {
    e.preventDefault()
    if (form.saving) return

    const result = validate()
    if (!result) return

    setForm("saving", true)

    const disabledProviders = config().disabled_providers ?? []
    const nextDisabled = disabledProviders.filter((id) => id !== result.providerID)

    // Set auth key if provided (fire-and-forget via extension message)
    if (result.key) {
      vscode.postMessage({ type: "setProviderAuth", providerID: result.providerID, key: result.key })
    }

    updateConfig({ provider: { [result.providerID]: result.config }, disabled_providers: nextDisabled })

    dialog.close()
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
      description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
    })

    setForm("saving", false)
  }

  function openDocs() {
    vscode.postMessage({ type: "openExternal", url: DOCS_URL })
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={() => dialog.close()}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "24px",
          padding: "0 10px 12px",
          "overflow-y": "auto",
          "max-height": "60vh",
        }}
      >
        <div style={{ padding: "0 10px", display: "flex", gap: "16px", "align-items": "center" }}>
          <div
            style={{
              "font-size": "16px",
              "font-weight": 500,
              color: "var(--text-strong-base, var(--vscode-foreground))",
            }}
          >
            {language.t("provider.custom.title")}
          </div>
        </div>

        <form
          onSubmit={save}
          style={{ padding: "0 10px 24px", display: "flex", "flex-direction": "column", gap: "24px" }}
        >
          <p style={{ "font-size": "14px", margin: 0, color: "var(--text-base, var(--vscode-foreground))" }}>
            {language.t("provider.custom.description.prefix")}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                openDocs()
              }}
              style={{ color: "var(--vscode-textLink-foreground)" }}
            >
              {language.t("provider.custom.description.link")}
            </a>
            {language.t("provider.custom.description.suffix")}
          </p>

          <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
            <TextField
              autofocus
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setForm("providerID", v)}
              validationState={errors.providerID ? "invalid" : undefined}
              error={errors.providerID}
            />
            <TextField
              label={language.t("provider.custom.field.name.label")}
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setForm("name", v)}
              validationState={errors.name ? "invalid" : undefined}
              error={errors.name}
            />
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => setForm("baseURL", v)}
              validationState={errors.baseURL ? "invalid" : undefined}
              error={errors.baseURL}
            />
            <TextField
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setForm("apiKey", v)}
            />
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <label
              style={{
                "font-size": "12px",
                "font-weight": 500,
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("provider.custom.models.label")}
            </label>
            <For each={form.models}>
              {(m, i) => (
                <div style={{ display: "flex", gap: "8px", "align-items": "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.models.id.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.id.placeholder")}
                      value={m.id}
                      onChange={(v) => setForm("models", i(), "id", v)}
                      validationState={errors.models[i()]?.id ? "invalid" : undefined}
                      error={errors.models[i()]?.id}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.models.name.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.name.placeholder")}
                      value={m.name}
                      onChange={(v) => setForm("models", i(), "name", v)}
                      validationState={errors.models[i()]?.name ? "invalid" : undefined}
                      error={errors.models[i()]?.name}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon="trash"
                    variant="ghost"
                    style={{ "margin-top": "6px" }}
                    onClick={() => removeModel(i())}
                    disabled={form.models.length <= 1}
                    aria-label={language.t("provider.custom.models.remove")}
                  />
                </div>
              )}
            </For>
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="plus-small"
              onClick={addModel}
              style={{ "align-self": "flex-start" }}
            >
              {language.t("provider.custom.models.add")}
            </Button>
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <label
              style={{
                "font-size": "12px",
                "font-weight": 500,
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("provider.custom.headers.label")}
            </label>
            <For each={form.headers}>
              {(h, i) => (
                <div style={{ display: "flex", gap: "8px", "align-items": "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.headers.key.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.key.placeholder")}
                      value={h.key}
                      onChange={(v) => setForm("headers", i(), "key", v)}
                      validationState={errors.headers[i()]?.key ? "invalid" : undefined}
                      error={errors.headers[i()]?.key}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.headers.value.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.value.placeholder")}
                      value={h.value}
                      onChange={(v) => setForm("headers", i(), "value", v)}
                      validationState={errors.headers[i()]?.value ? "invalid" : undefined}
                      error={errors.headers[i()]?.value}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon="trash"
                    variant="ghost"
                    style={{ "margin-top": "6px" }}
                    onClick={() => removeHeader(i())}
                    disabled={form.headers.length <= 1}
                    aria-label={language.t("provider.custom.headers.remove")}
                  />
                </div>
              )}
            </For>
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="plus-small"
              onClick={addHeader}
              style={{ "align-self": "flex-start" }}
            >
              {language.t("provider.custom.headers.add")}
            </Button>
          </div>

          <Button
            style={{ "align-self": "flex-start" }}
            type="submit"
            size="large"
            variant="primary"
            disabled={form.saving}
          >
            {form.saving ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
