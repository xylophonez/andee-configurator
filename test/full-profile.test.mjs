import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildConfig, strippedKeys } from "../src/build-config.js";
import { AGENT_DEVICES, CAPABILITIES, PROFILES, TUNNELS, TUNNEL_IMPL, TUNNEL_PEER } from "../src/presets.js";
import { publicConfigPreview } from "../src/provider-config.js";
import { deployment, owner } from "./fixtures/full-deployment.mjs";

const choices = { layers: ["full"], deployment, agentOwner: owner };

test("production profiles without a tunnel choice use the visible default", () => {
  const production = JSON.parse(readFileSync(new URL("../deployment.json", import.meta.url), "utf8"));
  for (const layers of [["full"], ["staked-bundler"]]) {
    const config = buildConfig({ layers, deployment: production, agentOwner: owner, beneficiary: owner });
    assert.equal(config.on.start.find((hook) => hook.device === "tunnel@1.0").peer, TUNNEL_PEER);
  }
});

test("Full is first and preserves the complete paid composition while adding the agent", () => {
  assert.equal(CAPABILITIES[0].id, "full");
  assert.equal(PROFILES[0].name, "Full");
  const config = buildConfig(choices);
  const paid = buildConfig({ layers: ["staked-bundler"], deployment, beneficiary: owner });
  assert.deepEqual(config.on, paid.on);
  assert.deepEqual(config.routes, paid.routes);
  assert.equal(config.on.request, undefined, "inherit the native request hooks");
  assert.equal(config["allow-rejected-peer-attestation"], false);
  assert.equal(config["zone-allow"], undefined, "staking owns zone selection");
  assert.equal(config["bundler-beneficiary"], owner);
  assert.equal(config["ao-payment-ledger-path"], paid["ao-payment-ledger-path"]);
  for (const [name, pin] of Object.entries(paid["trusted-devices"])) {
    assert.equal(config["trusted-devices"][name], pin);
  }
  assert.ok(!JSON.stringify(config).includes("bundler-gc"));
  assert.deepEqual(strippedKeys(config), []);
  assert.equal(config["andee-profile-source"], "andee-configurator/full");
});

test("Full lets the owner bundle for free and leaves the staked bundler priced", () => {
  assert.deepEqual(buildConfig(choices)["faff-allow-list"], [owner]);
  const other = "B".repeat(43);
  assert.deepEqual(buildConfig({ ...choices, beneficiary: other })["faff-allow-list"], [owner, other]);
  assert.equal(buildConfig({ layers: ["staked-bundler"], deployment, beneficiary: owner })["faff-allow-list"], undefined);
});

test("every agent dependency loads through normal pins and the owner stays consistent", () => {
  const config = buildConfig(choices);
  for (const name of AGENT_DEVICES) {
    assert.equal(config["trusted-devices"][name], deployment.agent.devices[name].implementation);
    assert.equal(config["name-resolvers"][0][name], deployment.agent.devices[name].spec);
  }
  assert.equal(config.operator, owner);
  assert.equal(config["ouroboros-operator-address"], owner);
  assert.equal(config["intelligence-pool-subscription-owner"], owner);
  assert.equal(config["ouroboros-execution-device"], "andock@1.0");
  assert.equal(config["trusted-devices"]["andock@1.0"], undefined);
  assert.equal(config["intelligence-pool-directory"], "../intelligence-pool");
  assert.equal(config["intelligence-pool-compute-mode"], "shared");
  assert.equal(config["intelligence-pool-oauth-listener"], false);
  assert.equal(config["inference-provider"], "intelligence-pool");
  assert.deepEqual(config["inference-provider-priority"], ["intelligence-pool", "apus"]);
  assert.equal(config["inference-providers"]["intelligence-pool"]["inference-device"], "intelligence-pool@1.0");
  assert.ok(!JSON.stringify(config).includes("callback"));
});

test("a distinct payout address never changes agent ownership", () => {
  const payout = "k".repeat(43);
  const config = buildConfig({ ...choices, beneficiary: payout });
  assert.equal(config["bundler-beneficiary"], payout);
  assert.equal(config["intelligence-pool-subscription-owner"], owner);
});

test("an API key uses private provider configuration without removing Pool", () => {
  const config = buildConfig({ ...choices, inference: { provider: "openai", apiKey: "synthetic-secret", model: "synthetic-model" } });
  assert.equal(config["inference-providers"].openai.priv["api-key"], "synthetic-secret");
  assert.equal(config["inference-provider"], "openai");
  assert.deepEqual(config["inference-provider-priority"], ["openai", "intelligence-pool", "apus"]);
  assert.ok(config["inference-providers"]["intelligence-pool"]);
  assert.ok(!JSON.stringify(publicConfigPreview(config)).includes("synthetic-secret"));
});

test("incomplete releases, bad ownership and mixed presets cannot produce a configuration", () => {
  for (const agentOwner of ["", "A".repeat(43), "d".repeat(43), "not-a-wallet"]) {
    assert.throws(() => buildConfig({ ...choices, agentOwner }), /wallet address/);
  }
  assert.throws(() => buildConfig({ ...choices, deployment: { ...deployment, mode: "unavailable" } }), /not available/);
  for (const missing of AGENT_DEVICES) {
    const next = structuredClone(deployment);
    delete next.agent.devices[missing];
    assert.throws(() => buildConfig({ ...choices, deployment: next }), /package is missing/);
  }
  assert.throws(() => buildConfig({ ...choices, layers: ["full", "zone"] }), /on its own/);
});

test("Full uses the visible tunnel controls in its startup composition", () => {
  const config = buildConfig({ ...choices, tunnelPeer: "https://another.tunnel.test/", tunnelWorkers: 5, tunnelImpl: "T".repeat(43) });
  const hook = config.on.start.find((entry) => entry.device === "tunnel@1.0");
  assert.equal(hook.peer, "https://another.tunnel.test");
  assert.equal(hook.workers, 5);
  assert.equal(config["trusted-devices"]["tunnel@1.0"], "T".repeat(43));
  assert.equal(buildConfig({ ...choices, tunnelWorkers: 99 }).on.start[1].workers, 32);
  assert.throws(() => buildConfig({ ...choices, tunnelPeer: "" }), /Tunnel/);
});

test("a selected tunnel provider still passes production validation", () => {
  const production = { ...deployment, mode: "production", gateway: "https://arweave.net", tunnel: { peer: "https://smoke.solutions" } };
  for (const tunnelPeer of ["https://private.home", "https://127.0.0.1", "https://smoke.solutions/path", "http://smoke.solutions"]) {
    assert.throws(() => buildConfig({ ...choices, deployment: production, tunnelPeer }), /Tunnel/);
  }
  const config = buildConfig({ ...choices, deployment: production, tunnelPeer: "https://relay.smoke.solutions", tunnelWorkers: 3 });
  assert.equal(config.on.start[1].peer, "https://relay.smoke.solutions");
  assert.equal(config.on.start[1].workers, 3);
});

test("choosing Mystical only changes Full's tunnel peer", () => {
  const smoke = buildConfig({ ...choices, tunnelPeer: TUNNELS.find((tunnel) => tunnel.id === "smoke").peer, tunnelImpl: TUNNEL_IMPL });
  const mystical = buildConfig({ ...choices, tunnelPeer: TUNNEL_PEER, tunnelImpl: TUNNEL_IMPL });
  const hook = smoke.on.start.find((entry) => entry.device === "tunnel@1.0");
  assert.equal(hook.peer, "https://smoke.solutions");
  hook.peer = "https://tunnel.mystical.computer";
  assert.deepEqual(mystical, smoke);
  assert.equal(mystical["trusted-devices"]["tunnel@1.0"], undefined);
});
