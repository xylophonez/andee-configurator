import assert from "node:assert/strict";
import test from "node:test";
import { providerConfig, providerModelIds, publicConfigPreview } from "../src/provider-config.js";

const ids = [
  "qwen/qwen3.8-flash",
  "deepseek/deepseek-v4.1-flash-1017",
  "heygen/heygen-voice-1-turbo:free",
  "~deepseek/deepseek-flash-latest",
];

test("copied provider IDs become catalogue objects without rewriting the ID", () => {
  for (const id of ids) {
    const config = providerConfig({ provider: "openrouter", apiKey: "synthetic-only", model: `  ${id}  ` });
    const provider = config["inference-providers"].openrouter;
    assert.equal(provider["default-model"], id);
    assert.deepEqual(provider.models, [{ id }]);
    assert.deepEqual(config["inference-provider-priority"], ["openrouter"]);
    assert.equal(provider.priv["api-key"], "synthetic-only");
    assert.ok(!JSON.stringify(publicConfigPreview(config)).includes("synthetic-only"));
  }
});

test("multiple models preserve order, variants and aliases, and deduplicate exact IDs", () => {
  const input = `${ids[0]}, ${ids[1]}\r\n${ids[2]}\n${ids[3]}\n${ids[0]}\n`;
  const config = providerConfig({ provider: "openrouter", apiKey: "synthetic-only", model: input });
  assert.deepEqual(config["inference-providers"].openrouter.models, ids.map((id) => ({ id })));
  assert.equal(config["inference-providers"].openrouter["default-model"], ids[0]);
  assert.deepEqual(providerModelIds("vendor/Model:free, vendor/Model, ~owner/preset"),
    ["vendor/Model:free", "vendor/Model", "~owner/preset"]);
});

test("invalid IDs produce a visible input error rather than an empty catalogue", () => {
  for (const model of ["", " , \n", "vendor/model name", "vendor/model\tname", "vendor/\0model", "https://openrouter.ai/vendor/model"]) {
    assert.throws(() => providerConfig({ provider: "openrouter", apiKey: "synthetic-only", model }), /Paste model IDs/);
  }
});

test("other providers use the same catalogue shape and no provider stays optional", () => {
  for (const provider of ["openai", "anthropic"]) {
    assert.deepEqual(providerConfig({ provider, apiKey: "synthetic-only", model: "model-name" })["inference-providers"][provider].models,
      [{ id: "model-name" }]);
  }
  assert.deepEqual(providerConfig(), {});
});
