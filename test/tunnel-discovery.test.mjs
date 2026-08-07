import test from "node:test";
import assert from "node:assert/strict";
import {
  locationRecords,
  probeTunnel,
  describePrice,
  asTunnelEntry,
} from "../src/tunnel-discovery.js";

/** Stand in for the network. Routes by substring so a test only has to
 *  describe the endpoints it cares about; anything unlisted 404s, which is
 *  what an unrelated node looks like. */
function stubFetch(routes) {
  return async (url, init) => {
    const target = String(url);
    for (const [needle, reply] of Object.entries(routes)) {
      if (!target.includes(needle)) continue;
      const value = typeof reply === "function" ? reply(target, init) : reply;
      if (value === "throw") throw new TypeError("fetch failed");
      return {
        ok: true,
        status: 200,
        json: async () => value,
        text: async () => (typeof value === "string" ? value : JSON.stringify(value)),
      };
    }
    return { ok: false, status: 404, json: async () => null, text: async () => "" };
  };
}

function graphqlReply(records) {
  return {
    data: {
      transactions: {
        edges: records.map((record) => ({
          node: {
            id: record.id ?? "tx",
            owner: { address: record.address ?? "addr" },
            tags: [
              { name: "Type", value: "Scheduler-Location" },
              { name: "Url", value: record.url },
              { name: "Time-To-Live", value: String(record.ttl ?? 3600000) },
            ],
          },
        })),
      },
    },
  };
}

const realFetch = globalThis.fetch;
function withFetch(routes, run) {
  globalThis.fetch = stubFetch(routes);
  return run().finally(() => { globalThis.fetch = realFetch; });
}

test("location records are deduplicated by url", async () => {
  await withFetch(
    { "/graphql": graphqlReply([
        { url: "https://a.example" },
        { url: "https://a.example/" },
        { url: "https://b.example" },
      ]) },
    async () => {
      const records = await locationRecords({});
      assert.deepEqual(records.map((r) => r.url), ["https://a.example", "https://b.example"]);
    },
  );
});

test("records without an http(s) url are discarded", async () => {
  await withFetch(
    { "/graphql": graphqlReply([
        { url: "ao-su:9000" },
        { url: "" },
        { url: "https://good.example" },
      ]) },
    async () => {
      const records = await locationRecords({});
      assert.deepEqual(records.map((r) => r.url), ["https://good.example"]);
    },
  );
});

test("a node that does not answer the tunnel status is not a router", async () => {
  await withFetch(
    { "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 1, status: 200 } },
    async () => {
      assert.equal(await probeTunnel("https://not-a-tunnel.example"), null);
    },
  );
});

test("a router reports its live pin, price and registration count", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 16, status: 200 },
      "/~meta@1.0/info/trusted-devices/tunnel%401.0": "PINPINPIN\n",
      "/~meta@1.0/info/metering-rates": {
        "meta-bytes-in": 1, "meta-bytes-out": 0, "beam-reductions": 0, status: 200,
      },
    },
    async () => {
      const probe = await probeTunnel("https://paid.example/");
      assert.equal(probe.peer, "https://paid.example");
      assert.equal(probe.impl, "PINPINPIN");
      assert.equal(probe.registrations, 16);
      assert.equal(probe.egressRate, 1);
      assert.equal(probe.free, false);
      // Zero-rated resources are not "prices" -- they must not appear.
      assert.deepEqual(probe.rates, { "meta-bytes-in": 1 });
    },
  );
});

test("a router with every rate at zero reads as free", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 3, status: 200 },
      "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 0, status: 200 },
    },
    async () => {
      const probe = await probeTunnel("https://free.example");
      assert.equal(probe.free, true);
      assert.equal(describePrice(probe), "free");
    },
  );
});

test("an unreadable pin is reported as unknown, not guessed", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 1, status: 200 },
      // Device names contain `@`, which a node renders into an illegal HTTP
      // header name; strict clients reject the whole response.
      "/~meta@1.0/info/trusted-devices": "throw",
      "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 2, status: 200 },
    },
    async () => {
      const probe = await probeTunnel("https://noping.example");
      assert.equal(probe.impl, null);
      assert.match(asTunnelEntry(probe).note, /implementation pin unavailable/);
    },
  );
});

test("price is quoted per terabyte from the rate per byte", () => {
  assert.equal(describePrice({ egressRate: 1, rates: { "meta-bytes-in": 1 }, free: false }), "~$2.00/TB");
  assert.equal(describePrice({ egressRate: 5, rates: { "meta-bytes-in": 5 }, free: false }), "~$10.00/TB");
});

test("a router priced on something other than egress says so", () => {
  const described = describePrice({ egressRate: 0, rates: { "meta-request-ms": 4 }, free: false });
  assert.equal(described, "priced on meta-request-ms");
});

test("a discovered router is shaped like a built-in one", () => {
  const entry = asTunnelEntry({
    peer: "https://x.example", impl: "PIN", registrations: 1,
    rates: { "meta-bytes-in": 1 }, egressRate: 1, free: false,
  });
  for (const key of ["id", "name", "peer", "impl", "note"]) {
    assert.ok(key in entry, `missing ${key}`);
  }
  assert.equal(entry.name, "x.example");
  assert.equal(entry.discovered, true);
  // Singular when one node is connected; the plural bug is easy and visible.
  assert.match(entry.note, /1 node connected/);
});
