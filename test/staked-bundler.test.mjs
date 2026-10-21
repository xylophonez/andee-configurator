import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig, strippedKeys } from "../src/build-config.js";
import { CAPABILITIES } from "../src/presets.js";

export const deployment = {
  version: 1, mode: "lab",
  tunnel: { peer: "https://tunnel.example", implementation: "a".repeat(43) },
  zone: { name: "lab-zone", peer: "http://192.0.2.1:28753", ring: "b".repeat(43) },
  gateway: "http://192.168.1.194:36245", stakingUrl: "http://192.0.2.1:5173",
};
const build = (d = deployment) => buildConfig({ layers: ["staked-bundler"], deployment: d });

test("recommended preset composes v0.11 devices without phone-specific input", () => {
  assert.equal(CAPABILITIES[0].id, "staked-bundler");
  const config = build();
  assert.deepEqual(strippedKeys(config), []);
  assert.equal(config["zone-self-url"], undefined);
  assert.equal(config["public-url"], undefined);
  assert.equal(config["allow-rejected-peer-attestation"], false);
  assert.deepEqual(config["zone-allow"], { "lab-zone": deployment.zone.peer });
  assert.equal(config["zone-ring-address"], deployment.zone.ring);
  assert.equal(config.on.start[0].path, "start");
  assert.equal(config.on.start[0].hook, undefined, "URL result must reach subsequent hooks");
  assert.deepEqual(config.on.start.slice(1).map((hook) => hook.hook), [{ result: "ignore" }, { result: "ignore" }]);
  assert.equal(config.on.start[2].schedule["cron-path"], "/~zone@1.3/start");
  assert.equal(config["trusted-devices"]["tunnel@1.1"], deployment.tunnel.implementation);
  assert.equal(config.routes[0].node.with, deployment.gateway);
  assert.equal(config["bundler-beneficiary"], undefined, "staking wallet is chosen on the staking page");
  assert.ok(!JSON.stringify(config).includes("0ER8"), "no obsolete paid-profile bootstrap");
});

test("incomplete deployment and mixed legacy layers cannot produce a download", () => {
  assert.throws(() => build(null), /not available/);
  assert.throws(() => build({ ...deployment, mode: "production" }), /review/);
  assert.throws(() => build({ ...deployment, tunnel: { peer: "https://tunnel.example" } }), /pin/);
  assert.throws(() => build({ ...deployment, zone: { ...deployment.zone, ring: "" } }), /ring/);
  assert.throws(() => buildConfig({ layers: ["staked-bundler", "bundler"], deployment }), /on its own/);
});

test("unsafe origins and malformed tunnel DNS are rejected", () => {
  for (const peer of ["http://tunnel.example", "https://user:pass@tunnel.example", "https://a..b", "https://a.-b", "https://127.0.0.1", "https://tunnel.example/path", "https://tunnel.example:65536"]) {
    assert.throws(() => build({ ...deployment, tunnel: { ...deployment.tunnel, peer } }), /Tunnel/);
  }
  assert.throws(() => build({ ...deployment, stakingUrl: "javascript:alert(1)" }), /Staking/);
  assert.throws(() => build({ ...deployment, gateway: "https://arweave.net" }), /public L1/);
});
