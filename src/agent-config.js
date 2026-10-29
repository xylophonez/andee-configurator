import { AGENT_DEVICES } from "./presets.js";
import { APUS_PROVIDER, providerConfig } from "./provider-config.js";

/** Compose the existing personal-agent and Pool contracts; no login credentials at boot. */
export function agentConfig(choices) {
  const owner = String(choices.agentOwner || "").trim();
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(owner) || owner === "A".repeat(43)) {
    throw new Error("Enter your extension's Arweave wallet address to connect your agent.");
  }
  const deployment = choices.deployment;
  if (!deployment?.agent || deployment.mode === "unavailable") {
    throw new Error("The agent package release is not available yet.");
  }
  const names = {};
  const trusted = {};
  for (const name of AGENT_DEVICES) {
    const pin = deployment.agent.devices?.[name];
    if (!/^[A-Za-z0-9_-]{43}$/.test(pin?.spec || "") ||
        !/^[A-Za-z0-9_-]{43}$/.test(pin?.implementation || "")) {
      throw new Error(`The ${name} package is missing from this release.`);
    }
    names[name] = pin.spec;
    trusted[name] = pin.implementation;
    trusted[pin.spec] = pin.implementation;
  }
  const provider = providerConfig(choices.inference);
  return {
    admin: owner,
    operator: owner,
    "ouroboros-operator-address": owner,
    "ouroboros-execution-device": "andock@1.0",
    "trusted-devices": trusted,
    "name-resolvers": [names],
    "intelligence-pool-directory": "../intelligence-pool",
    "intelligence-pool-compute-mode": "shared",
    "intelligence-pool-provider": "openai-subscription",
    "intelligence-pool-subscription-owner": owner,
    "intelligence-pool-oauth-listener": false,
    "inference-provider": choices.inference?.provider || "intelligence-pool",
    "inference-provider-priority": [...new Set([
      ...(provider["inference-provider-priority"] || []).filter((id) => id !== "apus"),
      "intelligence-pool", "apus",
    ])],
    "inference-providers": {
      "intelligence-pool": { "inference-device": "intelligence-pool@1.0" },
      ...provider["inference-providers"],
      apus: structuredClone(APUS_PROVIDER),
    },
  };
}
