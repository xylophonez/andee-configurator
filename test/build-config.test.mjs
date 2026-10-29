import assert from "node:assert/strict";
import test from "node:test";

import { buildConfig, normalizePeer, strippedKeys, RESERVED_BOOT_KEYS } from "../src/build-config.js";
import { TUNNELS, TUNNEL_IMPL, TUNNEL_PEER, ZONES, tunnelByPeer } from "../src/presets.js";

import { deployment, owner } from "./fixtures/full-deployment.mjs";

const zone = { name: "test-zone", peer: "https://zone.example" };

const base = {
  deployment, agentOwner: owner,
  tunnelPeer: TUNNEL_PEER,
  tunnelWorkers: "8",
  tunnelImpl: TUNNEL_IMPL,
  zoneName: zone.name,
  zonePeer: zone.peer,
  beneficiary: "kaYP9bJtpqON8Kyy3RbqnqdtDBDUsPTQTNUCvZtKiFI",
  maxItems: "1000",
};

test("all agent profiles retain APUS last without changing the selected provider", () => {
  for (const profile of ["full", "ouroboros", "ouroboros-bundler"]) {
    const normal = buildConfig({ ...base, profile });
    assert.equal(normal["inference-provider"], "intelligence-pool");
    assert.deepEqual(normal["inference-provider-priority"], ["intelligence-pool", "apus"]);
    assert.equal(normal["inference-providers"].apus.priv, undefined);
    const keyed = buildConfig({ ...base, profile, inference: { provider: "openrouter", apiKey: "synthetic-only" } });
    assert.equal(keyed["inference-provider"], "openrouter");
    assert.deepEqual(keyed["inference-provider-priority"], ["openrouter", "intelligence-pool", "apus"]);
    const free = buildConfig({ ...base, profile, inference: { provider: "apus" } });
    assert.equal(free["inference-provider"], "apus");
    assert.deepEqual(free["inference-providers"], normal["inference-providers"]);
    assert.equal(free["docs-include-loaded"], undefined);
  }
});

test("plain profile emits no tunnel, zone or bundler keys", () => {
  const config = buildConfig({ ...base, profile: "plain" });
  assert.equal(config.on, undefined);
  assert.equal(config["zone-allow"], undefined);
  assert.equal(config["bundler-beneficiary"], undefined);
  assert.equal(config["andee-profile-source"], "andee-configurator/plain");
});

test("tunnel profile uses the native preload and a connect hook", () => {
  const config = buildConfig({ ...base, profile: "tunnel" });
  const hook = config.on.start[0];
  assert.equal(hook.device, "tunnel@1.0");
  assert.equal(hook.path, "connect");
  assert.equal(hook.peer, TUNNEL_PEER);
  assert.equal(hook.workers, 8);
  assert.equal(config["trusted-devices"]?.["tunnel@1.0"], undefined);
});

test("zone member joins exactly the named zone", () => {
  const config = buildConfig({ ...base, profile: "zone-member" });
  assert.deepEqual(config["zone-allow"], { [zone.name]: zone.peer });
  assert.equal(config["zone-init-allow"], undefined);
});

test("zone host may create a zone", () => {
  const config = buildConfig({ ...base, profile: "zone-host" });
  assert.equal(config["zone-init-allow"], true);
});

test("bundler profile installs the p4 bootstrap hook and pins its devices", () => {
  const config = buildConfig({ ...base, profile: "bundler" });
  const devices = config.on.start.map((h) => h.device);
  assert.ok(devices.includes("tunnel@1.0"));
  assert.ok(devices.includes("xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q"));
  assert.equal(config["bundler-beneficiary"], base.beneficiary);
  assert.ok(config["trusted-devices"]["lapee-p4-bootstrap@1.0"]);
  assert.deepEqual(config.on.request, [{ device: "manifest@1.0" }]);
});

test("bundler route rank stays separate from the live AO upload quote", () => {
  // A stale caller-supplied price must not turn a relative router signal or
  // the legacy simple-pay fallback into an apparent fixed upload charge.
  const config = buildConfig({ ...base, profile: "bundler", price: "1000000000" });
  assert.equal(config["simple-pay-price"], 0);
  assert.deepEqual(config["router-opts"].offered.map((route) => route.price), [0, 0, 0]);
  assert.equal(config["arweave-byte-price"], "dynamic");
});

test("bundler without a beneficiary is refused rather than silently misconfigured", () => {
  assert.throws(
    () => buildConfig({ ...base, profile: "bundler", beneficiary: "  " }),
    /beneficiary/i,
  );
});

test("joining a zone without a peer is refused", () => {
  assert.throws(
    () => buildConfig({ ...base, profile: "zone-member", zonePeer: "" }),
    /zone/i,
  );
});

test("no profile ever emits a reserved boot key", () => {
  for (const profile of ["plain", "tunnel", "zone-member", "zone-host", "bundler", "bundler-zone", "ouroboros", "ouroboros-bundler"]) {
    const config = buildConfig({ ...base, profile });
    assert.deepEqual(
      strippedKeys(config),
      [],
      `${profile} emitted reserved keys the node would strip`,
    );
  }
});

test("hyperbuddy is disabled via default-index, not the no-op render-index-page", () => {
  const config = buildConfig({ ...base, profile: "plain", disableHyperbuddy: true });
  assert.equal(config["default-index"], false);
  assert.equal(config["render-index-page"], undefined);
});

test("worker count and item count are clamped to sane bounds", () => {
  assert.equal(buildConfig({ ...base, profile: "tunnel", tunnelWorkers: "999" }).on.start[0].workers, 32);
  assert.equal(buildConfig({ ...base, profile: "tunnel", tunnelWorkers: "0" }).on.start[0].workers, 1);
  assert.equal(buildConfig({ ...base, profile: "bundler", maxItems: "0" })["bundler-max-items"], 1);
});

test("output is valid JSON and round-trips", () => {
  const config = buildConfig({ ...base, profile: "bundler-zone" });
  const text = JSON.stringify(config, null, 2);
  assert.deepEqual(JSON.parse(text), config);
});

test("the reserved key list matches the node's own", () => {
  // Mirrors RESERVED_TOP_LEVEL_BOOT_KEYS in AndeeBootConfigStore.kt.
  assert.ok(RESERVED_BOOT_KEYS.includes("store"));
  assert.ok(RESERVED_BOOT_KEYS.includes("load-remote-devices"));
  assert.ok(RESERVED_BOOT_KEYS.includes("preloaded-store"));
});

test("ouroboros loads its agent dependencies and uses the platform andock", () => {
  const config = buildConfig({ ...base, profile: "ouroboros" });
  assert.equal(config["name-resolvers"][0]["ouroboros@1.0"], deployment.agent.devices["ouroboros@1.0"].spec);
  assert.equal(config["trusted-devices"]["andock@1.0"], undefined);
  assert.equal(config["ouroboros-execution-device"], "andock@1.0");
  assert.equal(config["trusted-devices"]["intelligence-pool@1.0"], deployment.agent.devices["intelligence-pool@1.0"].implementation);
  assert.equal(config["lapee-profile"], "ouroboros-tunnel");
  assert.equal(config.on.start[0].device, "tunnel@1.0");
});

test("ouroboros carries no bundler keys", () => {
  const config = buildConfig({ ...base, profile: "ouroboros" });
  assert.equal(config["bundler-beneficiary"], undefined);
  assert.equal(config["ao-payment-ledger"], undefined);
});

test("ouroboros and bundler combine without duplicating a resolver", () => {
  const config = buildConfig({ ...base, profile: "ouroboros-bundler" });
  const resolvers = config["name-resolvers"];
  const pins = resolvers[0];
  assert.equal(pins["ouroboros@1.0"], deployment.agent.devices["ouroboros@1.0"].spec);
  assert.equal(pins["pricing-router@1.0"], "UH8LNK2WMtgVBhQ6YCkk5dPyKbp3hHsb9pWCznVfYNA");
  const devices = resolvers.filter((r) => r && r.device).map((r) => r.device);
  assert.deepEqual(devices, [...new Set(devices)], "a device resolver was emitted twice");
  assert.equal(config["trusted-devices"]["andock@1.0"], undefined);
  assert.equal(config["ouroboros-execution-device"], "andock@1.0");
  assert.ok(config["trusted-devices"]["lapee-p4-bootstrap@1.0"]);
  // The bundler owns lapee-profile when both are selected.
  assert.equal(config["lapee-profile"], "aopayment-bundler-p4-paid-remote");
});

test("capabilities are additive instead of exclusive", () => {
  const config = buildConfig({
    ...base,
    layers: ["tunnel", "zone", "ouroboros", "bundler"],
    zoneMode: "join",
  });
  assert.ok(config.on.start.some((hook) => hook.device === "tunnel@1.0"));
  assert.ok(config.on.start.some((hook) => hook.device === "xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q"));
  assert.deepEqual(config["zone-allow"], { [zone.name]: zone.peer });
  assert.equal(config["trusted-devices"]["andock@1.0"], undefined);
  assert.equal(config["ouroboros-execution-device"], "andock@1.0");
  assert.equal(config["bundler-beneficiary"], base.beneficiary);
  assert.equal(config["andee-profile-source"], "andee-configurator/tunnel+zone+ouroboros+bundler");
});

test("layer order controls start-hook order", () => {
  const config = buildConfig({ ...base, layers: ["bundler", "tunnel"] });
  assert.deepEqual(
    config.on.start.map((hook) => hook.device),
    ["xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q", "tunnel@1.0"],
  );
});

test("a zone layer may host without forcing public access", () => {
  const config = buildConfig({ ...base, layers: ["zone"], zoneMode: "host" });
  assert.equal(config["zone-init-allow"], true);
  assert.equal(config.on, undefined);
  assert.equal(config["trusted-devices"], undefined);
});

test("the default Smoke tunnel uses the bundled RC4 implementation", () => {
  assert.equal(TUNNEL_PEER, "https://smoke.solutions");
  assert.equal(TUNNEL_IMPL, "");
  assert.equal(TUNNELS[0].impl, "");
});

test("no router carries a hard-coded description", () => {
  // Routers are discovered and describe themselves when probed. A sentence
  // written here about someone else's tunnel is a claim we cannot keep true,
  // and it is shown to users as fact -- so the list must not carry one, and a
  // future entry must not quietly reintroduce it.
  for (const tunnel of TUNNELS) {
    assert.equal(tunnel.note, undefined, `${tunnel.id} must not hard-code a note`);
    assert.equal(tunnel.blurb, undefined, `${tunnel.id} must not hard-code a blurb`);
  }
});

test("selecting a tunnel retains the platform implementation by default", () => {
  for (const tunnel of TUNNELS) {
    const config = buildConfig({ layers: ["tunnel"], tunnelPeer: tunnel.peer, tunnelImpl: tunnel.impl });
    assert.equal(config.on.start[0].peer, tunnel.peer);
    assert.equal(config["trusted-devices"]?.["tunnel@1.0"], undefined);
  }
});

test("tunnelByPeer matches known routers regardless of trailing slash", () => {
  const first = TUNNELS[0];
  assert.equal(tunnelByPeer(first.peer)?.id, first.id);
  assert.equal(tunnelByPeer(`${first.peer}/`)?.id, first.id);
  assert.equal(tunnelByPeer("  " + first.peer + "  ")?.id, first.id);
  assert.equal(tunnelByPeer("https://not-a-known-router.example"), undefined);
  assert.equal(tunnelByPeer(""), undefined);
});

test("a hand-typed router without a scheme still produces a dialable peer", () => {
  // Entering a bare hostname is the natural thing to do, and a scheme-less
  // peer leaves the node sitting on "connecting" instead of failing loudly.
  const config = buildConfig({ layers: ["tunnel"], tunnelPeer: "tunnel.permaweb.space" });
  assert.equal(config.on.start[0].peer, "https://tunnel.permaweb.space");
});

test("peer normalisation keeps explicit schemes and trims trailing slashes", () => {
  assert.equal(normalizePeer("  https://a.example/  "), "https://a.example");
  assert.equal(normalizePeer("http://a.example"), "http://a.example");
  assert.equal(normalizePeer("a.example"), "https://a.example");
  assert.equal(normalizePeer(""), "");
  assert.equal(normalizePeer(undefined), "");
});

test("operators can explicitly select a different tunnel implementation", () => {
  const pin = "X".repeat(43);
  const config = buildConfig({ layers: ["tunnel"], tunnelPeer: TUNNEL_PEER, tunnelImpl: pin });
  assert.equal(config["trusted-devices"]["tunnel@1.0"], pin);
});

test("RC4 does not advertise the retired phone-zone endpoint", () => {
  assert.deepEqual(ZONES, []);
});
