import assert from "node:assert/strict";
import test from "node:test";
import { buildConfig, strippedKeys } from "../src/build-config.js";
import { CAPABILITIES } from "../src/presets.js";

export const deployment = {
  version: 1, mode: "lab",
  tunnel: { peer: "https://tunnel.example", implementation: "a".repeat(43) },
  gateway: "http://127.0.0.1:36245",
  payments: { reservationAmount: 10000000000, devices: Object.fromEntries([
    "ao-payment@1.2", "arweave-byte-pricing@1.0", "lapee-p4-bootstrap@1.1",
    "lapee-bundler-gc@1.0", "pricing-router@1.0", "simple-oracle@1.0",
  ].map((name, i) => [name, { spec: String(i).repeat(43), implementation: String(i + 1).repeat(43) }])) },
};
const beneficiary = "c".repeat(43);
const build = (d = deployment, payout = beneficiary) => buildConfig({ layers: ["staked-bundler"], deployment: d, beneficiary: payout });

test("recommended preset composes v0.11 devices without phone-specific input", () => {
  assert.equal(CAPABILITIES[0].id, "staked-bundler");
  const config = build();
  assert.deepEqual(strippedKeys(config), []);
  assert.equal(config["zone-self-url"], undefined);
  assert.equal(config["public-url"], undefined);
  assert.equal(config["allow-rejected-peer-attestation"], false);
  assert.equal(config["zone-allow"], undefined);
  assert.equal(config["zone-ring-address"], undefined);
  assert.equal(config.on.start[1].path, "start");
  assert.equal(config.on.start[1].hook, undefined, "URL result must reach subsequent hooks");
  assert.equal(config.on.start.length, 2);
  assert.ok(!JSON.stringify(config.on).includes("zone@"));
  assert.ok(!JSON.stringify(config.on).includes("cron@"));
  assert.equal(config["trusted-devices"]["tunnel@1.1"], deployment.tunnel.implementation);
  assert.equal(config.routes[0].node.with, deployment.gateway);
  assert.equal(config.routes[1].template, "/graphql");
  assert.equal(config.routes[1].node.prefix, deployment.gateway);
  assert.equal(config["bundler-beneficiary"], beneficiary);
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
  assert.equal(config["paid-auto-withdraw"], undefined);
  assert.equal(config.on.request, undefined);
  assert.equal(config["paid-request-hooks"], undefined);
  assert.equal(config["bundler-max-items"], 1000);
  assert.equal(config["lapee-bundler-completed-item-retention-ms"], 900000);
  assert.equal(config["ao-payment-ledger"], undefined);
  assert.ok(!JSON.stringify(config).includes("0ER8"), "no obsolete paid-profile bootstrap");
});

test("incomplete deployment and mixed legacy layers cannot produce a download", () => {
  assert.throws(() => build(null), /not available/);
  assert.throws(() => build({ ...deployment, mode: "unavailable" }), /disabled/);
  assert.throws(() => build({ ...deployment, tunnel: { peer: "https://tunnel.example" } }), /pin/);
  assert.throws(() => build(deployment, ""), /beneficiary/);
  assert.throws(() => build({ ...deployment, payments: undefined }), /payment deployment/);
  assert.throws(() => buildConfig({ layers: ["staked-bundler", "bundler"], deployment }), /on its own/);
});

test("live uploads require explicit live-test mode and HTTPS", () => {
  const live = { ...deployment, mode: "live-test", gateway: "https://arweave.net" };
  const config = build(live);
  assert.equal(config.gateway, live.gateway);
  assert.equal(config.routes[0].node.with, live.gateway);
  assert.equal(config["paid-auto-withdraw"], undefined);
  assert.throws(() => build({ ...live, gateway: "http://arweave.net" }), /HTTPS/);
  assert.throws(() => build({ ...live, gateway: "https://user:pass@arweave.net" }), /HTTPS/);
});

test("unsafe origins and malformed tunnel DNS are rejected", () => {
  for (const peer of ["http://tunnel.example", "https://user:pass@tunnel.example", "https://a..b", "https://a.-b", "https://127.0.0.1", "https://tunnel.example/path", "https://tunnel.example:65536"]) {
    assert.throws(() => build({ ...deployment, tunnel: { ...deployment.tunnel, peer } }), /Tunnel/);
  }
  assert.throws(() => build({ ...deployment, gateway: "https://arweave.net" }), /public L1/);
});


test("reviewed payment deployment requires a positive reservation and complete pins", () => {
  for (const reservationAmount of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => build({ ...deployment, payments: { reservationAmount } }), /reservation amount/);
  }
  assert.throws(() => build({ ...deployment, payments: { reservationAmount: 1000000, devices: {} } }), /specification/);
});


test("payout is user supplied, validated and independent of deployment ownership", () => {
  const another = "d".repeat(43);
  const stale = { ...deployment, beneficiary: another };
  assert.equal(build(stale)["bundler-beneficiary"], beneficiary);
  assert.equal(build(stale, `  ${beneficiary}  `)["bundler-beneficiary"], beneficiary);
  assert.equal(build(stale, another)["bundler-beneficiary"], another);
  for (const invalid of ["", " ", "short", "!".repeat(43)]) {
    assert.throws(() => build(stale, invalid), /beneficiary/);
  }
  assert.throws(() => buildConfig({ layers: ["staked-bundler"], deployment: stale }), /beneficiary/);
});

test("stale deployment zone and staking settings cannot constrain the node", () => {
  const stale = { ...deployment,
    zone: { name: "old-lab-zone", peer: "http://127.0.0.1:28753", ring: "b".repeat(43) },
    stakingUrl: "http://127.0.0.1:5484",
  };
  assert.deepEqual(build(stale), build());
});


test("production forbids private endpoints and test manifests cannot become the public default", async () => {
  const production = { ...deployment, mode: "production", gateway: "https://arweave.net",
    tunnel: { ...deployment.tunnel, peer: "https://broker.public-domain.com" } };
  assert.equal(build(production)["bundler-max-items"], 1000);
  for (const gateway of ["http://arweave.net", "https://192.168.1.2", "https://lab.home.arpa", "https://localhost", "https://[::1]"]) {
    assert.throws(() => build({ ...production, gateway }), /HTTPS/);
  }
  const { readFile } = await import("node:fs/promises");
  const current = JSON.parse(await readFile(new URL("../deployment.json", import.meta.url)));
  assert.equal(current.mode, "unavailable");
  assert.throws(() => build(current), /disabled/);
});
