import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildConfig, strippedKeys } from "../src/build-config.js";
const deployment = JSON.parse(readFileSync(new URL("../deployment.json", import.meta.url)));
const owner = "c".repeat(43);
const build = (layers, release = deployment, extra = {}) => buildConfig({ layers, deployment: release, agentOwner: owner, beneficiary: owner, ...extra });
const indexHooks = (config) => config.on?.start?.filter((hook) => hook.device === "apply@1.0") || [];

test("Full's complete current release is covered by four bounded native index hooks", () => {
  const config = build(["full"]);
  const pins = new Set([...Object.values(config["name-resolvers"][0]), ...Object.values(config["trusted-devices"])]);
  assert.equal(pins.size, 24);
  for (const pin of pins) assert.ok(Number.isSafeInteger(deployment.packageBlocks[pin]), `Missing confirmed block for ${pin}`);
  const hooks = indexHooks(config);
  assert.deepEqual(hooks.map((hook) => hook["package-request"].from), [2031295, 2030648, 2025980, 1940677]);
  for (const hook of hooks) {
    assert.deepEqual(hook["package-base"], { device: "copycat@1.0" });
    const block = hook["package-request"].from;
    assert.deepEqual(hook["package-request"], { path: "arweave", mode: "shallow", from: block, to: block, reindex: false });
    assert.deepEqual(hook.hook, { result: "ignore" });
    assert.equal(hook.base, "base:package-base");
    assert.equal(hook.request, "base:package-request");
    assert.equal(hook.path, "pair");
  }
  assert.deepEqual(strippedKeys(config), []);
});

test("indexing precedes application startup without changing pins, trust, routes or existing hooks", () => {
  const previous = structuredClone(deployment);
  delete previous.packageBlocks;
  for (const profile of ["full", "staked-bundler", "ouroboros"]) {
    const before = build([profile], previous);
    const after = build([profile]);
    const hooks = indexHooks(after);
    assert.ok(hooks.length > 0);
    const restored = structuredClone(after);
    if (before.on) restored.on = before.on;
    else delete restored.on;
    assert.deepEqual(restored, before);
    assert.deepEqual(after.on.start.slice(hooks.length), before.on?.start || []);
  }
  assert.deepEqual(indexHooks(build(["ouroboros"])).map((h) => h["package-request"].from), [2031295, 2030648]);
});

test("unselected blocks and explicit custom tunnel pins do not add indexing work", () => {
  const augmented = { ...deployment, packageBlocks: { ...deployment.packageBlocks, ["z".repeat(43)]: 1 } };
  const config = build(["full"], augmented, { tunnelImpl: "T".repeat(43) });
  assert.equal(config["trusted-devices"]["tunnel@1.0"], "T".repeat(43));
  assert.equal(indexHooks(config).length, 4);
  assert.deepEqual(indexHooks(build([], augmented)), []);
});

test("invalid selected confirmation heights cannot generate a setup", () => {
  const pin = deployment.agent.devices["agent@1.0"].implementation;
  for (const block of [-1, 1.5, "2031295", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => build(["full"], { ...deployment, packageBlocks: { ...deployment.packageBlocks, [pin]: block } }), /confirmation blocks/);
  }
});
