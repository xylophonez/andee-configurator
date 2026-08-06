import assert from "node:assert/strict";
import test from "node:test";

import { buildConfig, normalizePeer, strippedKeys, RESERVED_BOOT_KEYS } from "../src/build-config.js";
import { ANDOCK_IMPL, ANDOCK_SPEC, TUNNELS, TUNNEL_IMPL, TUNNEL_PEER, ZONES, tunnelByPeer } from "../src/presets.js";

const zone = ZONES[0];

const base = {
  tunnelPeer: TUNNEL_PEER,
  tunnelWorkers: "3",
  tunnelImpl: TUNNEL_IMPL,
  zoneName: zone.name,
  zonePeer: zone.peer,
  beneficiary: "kaYP9bJtpqON8Kyy3RbqnqdtDBDUsPTQTNUCvZtKiFI",
  price: "0",
  maxItems: "1000",
};

test("plain profile emits no tunnel, zone or bundler keys", () => {
  const config = buildConfig({ ...base, profile: "plain" });
  assert.equal(config.on, undefined);
  assert.equal(config["zone-allow"], undefined);
  assert.equal(config["bundler-beneficiary"], undefined);
  assert.equal(config["andee-profile-source"], "andee-configurator/plain");
});

test("tunnel profile pins the trusted implementation and a connect hook", () => {
  const config = buildConfig({ ...base, profile: "tunnel" });
  const hook = config.on.start[0];
  assert.equal(hook.device, "tunnel@1.0");
  assert.equal(hook.path, "connect");
  assert.equal(hook.peer, TUNNEL_PEER);
  assert.equal(hook.workers, 3);
  assert.equal(config["trusted-devices"]["tunnel@1.0"], TUNNEL_IMPL);
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
  assert.ok(devices.includes("RSQlLsmPZwwk7mxZuwMziGBFTMSTJT9OHm1xlq6MzrQ"));
  assert.equal(config["bundler-beneficiary"], base.beneficiary);
  assert.ok(config["trusted-devices"]["lapee-p4-bootstrap@1.0"]);
  assert.deepEqual(config.on.request, [{ device: "manifest@1.0" }]);
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

test("ouroboros profile pins the published andock device by spec and implementation", () => {
  const config = buildConfig({ ...base, profile: "ouroboros" });
  assert.equal(config["name-resolvers"][0]["andock@1.0"], ANDOCK_SPEC);
  assert.equal(config["trusted-devices"]["andock@1.0"], ANDOCK_IMPL);
  assert.equal(config["trusted-devices"][ANDOCK_SPEC], ANDOCK_IMPL);
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
  assert.equal(pins["andock@1.0"], ANDOCK_SPEC);
  assert.equal(pins["pricing-router@1.0"], "UH8LNK2WMtgVBhQ6YCkk5dPyKbp3hHsb9pWCznVfYNA");
  const devices = resolvers.filter((r) => r && r.device).map((r) => r.device);
  assert.deepEqual(devices, [...new Set(devices)], "a device resolver was emitted twice");
  assert.equal(config["trusted-devices"]["andock@1.0"], ANDOCK_IMPL);
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
  assert.ok(config.on.start.some((hook) => hook.device === "RSQlLsmPZwwk7mxZuwMziGBFTMSTJT9OHm1xlq6MzrQ"));
  assert.deepEqual(config["zone-allow"], { [zone.name]: zone.peer });
  assert.equal(config["trusted-devices"]["andock@1.0"], ANDOCK_IMPL);
  assert.equal(config["bundler-beneficiary"], base.beneficiary);
  assert.equal(config["andee-profile-source"], "andee-configurator/tunnel+zone+ouroboros+bundler");
});

test("layer order controls start-hook order", () => {
  const config = buildConfig({ ...base, layers: ["bundler", "tunnel"] });
  assert.deepEqual(
    config.on.start.map((hook) => hook.device),
    ["RSQlLsmPZwwk7mxZuwMziGBFTMSTJT9OHm1xlq6MzrQ", "tunnel@1.0"],
  );
});

test("a zone layer may host without forcing public access", () => {
  const config = buildConfig({ ...base, layers: ["zone"], zoneMode: "host" });
  assert.equal(config["zone-init-allow"], true);
  assert.equal(config.on, undefined);
  assert.equal(config["trusted-devices"], undefined);
});

test("each known tunnel carries its own implementation pin", () => {
  // A peer from one router with another router's pin is the commonest
  // registration failure, so the registry must not share a single global pin.
  assert.ok(TUNNELS.length >= 2);
  for (const tunnel of TUNNELS) {
    assert.match(tunnel.peer, /^https:\/\//);
    assert.ok(tunnel.impl && tunnel.impl.length === 43, `${tunnel.id} needs a 43-char impl id`);
  }
  const impls = new Set(TUNNELS.map((t) => t.impl));
  assert.equal(impls.size, TUNNELS.length, "routers must not share an implementation pin");
});

test("selecting a tunnel builds a config pinned to that router", () => {
  for (const tunnel of TUNNELS) {
    const config = buildConfig({ layers: ["tunnel"], tunnelPeer: tunnel.peer, tunnelImpl: tunnel.impl });
    assert.equal(config.on.start[0].peer, tunnel.peer);
    assert.equal(config["trusted-devices"]["tunnel@1.0"], tunnel.impl);
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
