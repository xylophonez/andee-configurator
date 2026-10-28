// inference@1.0 owns provider dispatch; AndEE's private boot config owns secrets.
export const INFERENCE_PROVIDERS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com" },
};

export function providerConfig({ provider, apiKey, model } = {}) {
  if (!provider) return {};
  const preset = INFERENCE_PROVIDERS[provider];
  if (!preset) throw new Error("Select a supported AI provider.");
  const key = String(apiKey || "").trim();
  const modelId = String(model || "").trim();
  if (!key || /[\x00-\x20\x7f]/.test(key)) throw new Error("Enter a provider API key without whitespace.");
  if (!modelId || /[\x00-\x20\x7f]/.test(modelId)) throw new Error("Enter the provider's model ID without whitespace.");
  return {
    "inference-provider-priority": [provider],
    "inference-providers": {
      [provider]: { "base-url": preset.baseUrl, "default-model": modelId, models: [modelId], priv: { "api-key": key } },
    },
  };
}

// The downloaded/staged configuration contains the key. Preview and clipboard never do.
export function publicConfigPreview(config) {
  return JSON.parse(JSON.stringify(config, (key, value) => key === "priv" ? { "api-key": "[private — included only when you apply or download]" } : value));
}
