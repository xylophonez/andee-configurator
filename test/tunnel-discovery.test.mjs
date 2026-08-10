import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverTunnels,
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
  const edges = (schema) => records
    .filter((record) => (record.schema ?? "legacy") === schema)
    .map((record) => {
      const current = schema === "current";
      return {
        node: {
          id: record.id ?? "tx",
          owner: { address: record.address ?? "addr" },
          block: { timestamp: record.published ?? Math.floor(Date.now() / 1000) },
          tags: [
            { name: current ? "type" : "Type", value: current ? "location" : "Scheduler-Location" },
            { name: current ? "url" : "Url", value: record.url },
            { name: current ? "time-to-live" : "Time-To-Live", value: String(record.ttl ?? 3600000) },
          ],
        },
      };
    });
  return {
    data: {
      legacy: { edges: edges("legacy") },
      current: { edges: edges("current") },
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

test("the location query applies its limit to both schemas", async () => {
  await withFetch(
    { "/graphql": (_url, init) => {
        const { query } = JSON.parse(init.body);
        assert.doesNotMatch(query, /%LIMIT%/);
        assert.equal([...query.matchAll(/first: 7/g)].length, 2);
        return graphqlReply([]);
      } },
    async () => assert.deepEqual(await locationRecords({ limit: 7 }), []),
  );
});

test("current location records supersede legacy records for the same url", async () => {
  await withFetch(
    { "/graphql": graphqlReply([
        { url: "https://a.example", id: "legacy", published: 1000 },
        { url: "https://a.example/", id: "current", published: 2000, schema: "current" },
        { url: "https://b.example", id: "other", schema: "current" },
      ]) },
    async () => {
      const records = await locationRecords({});
      assert.deepEqual(records.map((r) => r.url), ["https://b.example", "https://a.example"]);
      assert.equal(records.find((record) => record.url === "https://a.example").record, "current");
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
  for (const key of ["id", "name", "peer", "impl", "registrations", "free", "note"]) {
    assert.ok(key in entry, `missing ${key}`);
  }
  assert.equal(entry.name, "x.example");
  assert.equal(entry.discovered, true);
  assert.equal(entry.registrations, 1);
  assert.equal(entry.free, false);
  assert.equal(entry.note, "");
});

test("hosts nobody else can reach are discarded", async () => {
  const junk = [
    "http://localhost:8734", "http://127.0.0.1:9000", "http://10.1.2.3:8734",
    "http://192.168.1.185:8734", "http://172.20.0.5:8734", "http://169.254.1.1:8734",
    "http://ao-su:9000", "https://box.local:8734",
  ];
  await withFetch(
    { "/graphql": graphqlReply([...junk.map((url) => ({ url })), { url: "https://real.example" }]) },
    async () => {
      const records = await locationRecords({});
      assert.deepEqual(records.map((r) => r.url), ["https://real.example"]);
    },
  );
});

test("a republished record supersedes the node's older one", async () => {
  await withFetch(
    { "/graphql": graphqlReply([
        { url: "https://a.example", id: "old", published: 1000 },
        { url: "https://a.example", id: "new", published: 2000 },
      ]) },
    async () => {
      const records = await locationRecords({});
      assert.equal(records.length, 1);
      assert.equal(records[0].record, "new");
    },
  );
});

test("a lapsed record is flagged, not dropped", async () => {
  // Almost every record in the live registry has lapsed while its URL still
  // serves, so expiry must not be a filter or discovery returns nothing.
  await withFetch(
    { "/graphql": graphqlReply([{ url: "https://old.example", published: 1000, ttl: 3600000 }]) },
    async () => {
      const records = await locationRecords({});
      assert.equal(records.length, 1);
      assert.equal(records[0].expired, true);
    },
  );
});

test("a router whose node address matches the signer is verified", async () => {
  await withFetch(
    {
      "/graphql": graphqlReply([{ url: "https://honest.example", address: "NODEADDR" }]),
      "/~tunnel@1.0/status": { "open-registrations": 2, status: 200 },
      "/~meta@1.0/info/address": "NODEADDR",
      "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 1, status: 200 },
    },
    async () => {
      const { tunnels, unverified } = await discoverTunnels({});
      assert.equal(tunnels.length, 1);
      assert.equal(tunnels[0].verified, true);
      assert.equal(unverified, 0);
    },
  );
});

test("a record claiming someone else's node is marked unverified", async () => {
  // The impersonation case: a throwaway node booted from a production image
  // publishes "I am at <the production URL>". The URL answers -- it is a real
  // tunnel -- but the signer is not the node serving it.
  await withFetch(
    {
      "/graphql": graphqlReply([{ url: "https://real-tunnel.example", address: "IMPOSTOR" }]),
      "/~tunnel@1.0/status": { "open-registrations": 9, status: 200 },
      "/~meta@1.0/info/address": "THE-REAL-NODE",
      "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 1, status: 200 },
    },
    async () => {
      const { tunnels, unverified } = await discoverTunnels({});
      assert.equal(tunnels[0].verified, false);
      assert.equal(tunnels[0].claimedBy, "IMPOSTOR");
      assert.equal(unverified, 1);
      assert.match(asTunnelEntry(tunnels[0]).note, /signed by another address/);
    },
  );
});

test("verified routers sort above unverified ones", async () => {
  await withFetch(
    {
      "/graphql": graphqlReply([
        { url: "https://busy-fake.example", address: "IMPOSTOR" },
        { url: "https://quiet-real.example", address: "REAL" },
      ]),
      "busy-fake.example/~tunnel@1.0/status": { "open-registrations": 99, status: 200 },
      "quiet-real.example/~tunnel@1.0/status": { "open-registrations": 1, status: 200 },
      "busy-fake.example/~meta@1.0/info/address": "SOMEONE-ELSE",
      "quiet-real.example/~meta@1.0/info/address": "REAL",
      "/~meta@1.0/info/metering-rates": { "meta-bytes-in": 1, status: 200 },
    },
    async () => {
      const { tunnels } = await discoverTunnels({ concurrency: 1 });
      // Busiest would put the impostor first; verification must outrank it.
      assert.equal(tunnels[0].peer, "https://quiet-real.example");
      assert.equal(tunnels[0].verified, true);
    },
  );
});
