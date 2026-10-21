import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig, strippedKeys } from "../src/build-config.js";
import { CAPABILITIES } from "../src/presets.js";

export const deployment = {
  version: 1, mode: "lab",
  tunnel: { peer: "https://tunnel.example", implementation: "a".repeat(43) },
  zone: { name: "lab-zone", peer: "http://192.0.2.1:28753", ring: "b".repeat(43) },
  gateway: "http://192.168.1.194:36245", stakingUrl: "http://192.0.2.1:5173",
  beneficiary: "c".repeat(43),
  payments: { reservationAmount: 10000000000, devices: Object.fromEntries([
    "ao-payment@1.2", "arweave-byte-pricing@1.0", "lapee-p4-bootstrap@1.1",
    "lapee-bundler-gc@1.0", "pricing-router@1.0", "simple-oracle@1.0",
  ].map((name, i) => [name, { spec: String(i).repeat(43), implementation: String(i + 1).repeat(43) }])) },
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
  assert.equal(config.on.start[3].path, "start");
  assert.equal(config.on.start[3].hook, undefined, "URL result must reach subsequent hooks");
  assert.deepEqual(config.on.start.slice(4).map((hook) => hook.hook), [{ result: "ignore" }, { result: "ignore" }]);
  assert.equal(config.on.start[5].schedule["cron-path"], "/~zone@1.3/start");
  assert.equal(config["trusted-devices"]["tunnel@1.1"], deployment.tunnel.implementation);
  assert.equal(config.routes[0].node.with, deployment.gateway);
  assert.equal(config["bundler-beneficiary"], deployment.beneficiary);
  assert.equal(config.on.start[0].device, deployment.payments.devices["lapee-p4-bootstrap@1.1"].spec);
  assert.equal(config["ao-payment-ledger-path"], "/ledger~node-process@1.0");
  assert.equal(config["arweave-byte-price"], "dynamic");
  assert.equal(config["bundler-free-byte-limit"], 0);
  assert.equal(config["simple-pay-price"], 0);
  for (const [device, pin] of Object.entries(deployment.payments.devices)) {
    assert.equal(config["trusted-devices"][device], pin.implementation);
  }
  assert.ok(config["name-resolvers"][0]["ao-payment@1.0"]);
  assert.equal(config["name-resolvers"][0]["ao-payment@1.0"], deployment.payments.devices["ao-payment@1.2"].spec);
  assert.equal(config["paid-auto-withdraw"], true);
  assert.equal(config.on.request, undefined);
  assert.deepEqual(config.on.start[2], { device: "patch@1.0", path: "all", "patch-from": "req:body/paid-auto-withdraw", "patch-to": "body/ao-payment-auto-withdraw" });
  assert.deepEqual(config["paid-request-hooks"].map(h => h.device), ["p4@1.0", "rate-limit@1.0", "auth-hook@1.0", "name@1.0", "manifest@1.0", "blacklist@1.0"]);
  assert.ok(!JSON.stringify(config).includes("0ER8"), "no obsolete paid-profile bootstrap");
});

test("incomplete deployment and mixed legacy layers cannot produce a download", () => {
  assert.throws(() => build(null), /not available/);
  assert.throws(() => build({ ...deployment, mode: "production" }), /review/);
  assert.throws(() => build({ ...deployment, tunnel: { peer: "https://tunnel.example" } }), /pin/);
  assert.throws(() => build({ ...deployment, zone: { ...deployment.zone, ring: "" } }), /ring/);
  assert.throws(() => build({ ...deployment, beneficiary: undefined }), /Beneficiary/);
  assert.throws(() => build({ ...deployment, payments: undefined }), /payment deployment/);
  assert.throws(() => buildConfig({ layers: ["staked-bundler", "bundler"], deployment }), /on its own/);
});

test("live uploads require explicit live-test mode and HTTPS", () => {
  const live = { ...deployment, mode: "live-test", gateway: "https://arweave.net" };
  const config = build(live);
  assert.equal(config.gateway, live.gateway);
  assert.equal(config.routes[0].node.with, live.gateway);
  assert.equal(config["paid-auto-withdraw"], true);
  assert.throws(() => build({ ...live, gateway: "http://arweave.net" }), /HTTPS/);
  assert.throws(() => build({ ...live, gateway: "https://user:pass@arweave.net" }), /HTTPS/);
});

test("unsafe origins and malformed tunnel DNS are rejected", () => {
  for (const peer of ["http://tunnel.example", "https://user:pass@tunnel.example", "https://a..b", "https://a.-b", "https://127.0.0.1", "https://tunnel.example/path", "https://tunnel.example:65536"]) {
    assert.throws(() => build({ ...deployment, tunnel: { ...deployment.tunnel, peer } }), /Tunnel/);
  }
  assert.throws(() => build({ ...deployment, stakingUrl: "javascript:alert(1)" }), /Staking/);
  assert.throws(() => build({ ...deployment, gateway: "https://arweave.net" }), /public L1/);
});


test("reviewed payment deployment requires a positive reservation and complete pins", () => {
  for (const reservationAmount of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => build({ ...deployment, payments: { reservationAmount } }), /reservation amount/);
  }
  assert.throws(() => build({ ...deployment, payments: { reservationAmount: 1000000, devices: {} } }), /specification/);
});
