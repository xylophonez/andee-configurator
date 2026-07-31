import assert from "node:assert/strict";
import test from "node:test";

import { buildConfig, strippedKeys, RESERVED_BOOT_KEYS } from "../src/build-config.js";
import { TUNNEL_IMPL, TUNNEL_PEER, ZONES } from "../src/presets.js";

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
  for (const profile of ["plain", "tunnel", "zone-member", "zone-host", "bundler", "bundler-zone"]) {
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
