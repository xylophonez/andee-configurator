// inference@1.0 owns provider dispatch; AndEE's private boot config owns secrets.
export const INFERENCE_PROVIDERS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", requiresKey: true },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", requiresKey: true },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com", requiresKey: true },
  apus: { label: "APUS (free)", baseUrl: "https://hb.apus.network/~inference@1.0/v1", requiresKey: false },
};

// Offline catalogue fallback, verified against APUS /v1/models on 2026-10-29.
// inference@1.0 owns discovery/dispatch; attestation is not requested.
export const APUS_PROVIDER = {
  name: "APUS (free)",
  format: "custom",
  "base-url": INFERENCE_PROVIDERS.apus.baseUrl,
  "default-model": "Qwen/Qwen3.8-27B-FP8",
  models: [{ id: "Qwen/Qwen3.8-27B-FP8", name: "APUS Qwen3.8 27B (free)", context_length: 65536 }],
};

export function providerConfig({ provider, apiKey, model } = {}) {
  if (!provider) return {};
  const preset = INFERENCE_PROVIDERS[provider];
  if (!preset) throw new Error("Select a supported AI provider.");
  if (!preset.requiresKey) return {
    "inference-provider-priority": [provider],
    "inference-providers": { [provider]: structuredClone(APUS_PROVIDER) },
  };
  const key = String(apiKey || "").trim();
  const models = String(model || "").trim() ? providerModelIds(model) : [];
  if (!key || /[\x00-\x20\x7f]/.test(key)) throw new Error("Enter a provider API key without whitespace.");
  return {
    "inference-provider-priority": [provider],
    "inference-providers": {
      [provider]: {
        "base-url": preset.baseUrl,
        ...(models.length ? { "default-model": models[0], models: models.map((id) => ({ id })) } : {}),
        priv: { "api-key": key },
      },
    },
  };
}

// Provider IDs are opaque: slashes, variant suffixes and preset prefixes belong
// to the provider. Ouroboros adds its routing prefix when reporting the catalogue.
export function providerModelIds(value) {
  const models = [...new Set(String(value || "").split(/[\r\n,]+/).map((id) => id.trim()).filter(Boolean))];
  if (!models.length || models.length > 2000 || models.some((id) =>
    id.length > 2048 || /[\s\x00-\x1f\x7f]/u.test(id) || id.includes("://"))) {
    throw new Error("Paste model IDs, one per line or separated by commas, without spaces inside an ID.");
  }
  return models;
}

// The downloaded/staged configuration contains the key. Preview and clipboard never do.
export function publicConfigPreview(config) {
  return JSON.parse(JSON.stringify(config, (key, value) => key === "priv" ? { "api-key": "[private — included only when you apply or download]" } : value));
}
