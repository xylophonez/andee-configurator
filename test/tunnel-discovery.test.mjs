import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverTunnels,
  locationRecords,
  probeTunnel,
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
          owner: { address: record.address ?? `addr:${record.url.replace(/\/+$/, "")}` },
          block: { timestamp: record.published ?? Math.floor(Date.now() / 1000) },
          tags: [
            { name: current ? "type" : "Type", value: current ? "location" : "Scheduler-Location" },
            { name: current ? "url" : "Url", value: record.url },
            { name: current ? "time-to-live" : "Time-To-Live", value: String(record.ttl ?? 3600000) },
            ...(record.nonce === undefined ? [] : [{ name: current ? "nonce" : "Nonce", value: String(record.nonce) }]),
          ],
        },
      };
    });
  return {
    data: {
      legacy: { pageInfo: { hasNextPage: false }, edges: edges("legacy") },
      current: { pageInfo: { hasNextPage: false }, edges: edges("current") },
    },
  };
}

const realFetch = globalThis.fetch;
const routerHook = { device: "tunnel@1.0", path: "request", status: 200 };
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

test("location crawl follows cursors and stops at the page bound", async () => {
  let calls = 0;
  const edge = (id, cursor) => ({ cursor, node: {
    id, owner: { address: id }, block: { timestamp: Math.floor(Date.now() / 1000) },
    tags: [{ name: "type", value: "location" }, { name: "url", value: `https://${id}.example` }],
  } });
  await withFetch({ "/graphql": (_url, init) => {
    calls++;
    const { query } = JSON.parse(init.body);
    if (calls === 1) return { data: {
      legacy: { pageInfo: { hasNextPage: false }, edges: [] },
      current: { pageInfo: { hasNextPage: true }, edges: [edge("one", "next-page")] },
    } };
    assert.match(query, /after: "next-page"/);
    assert.doesNotMatch(query, /legacy:/);
    return { data: { current: {
      pageInfo: { hasNextPage: false }, edges: [edge("two", "page-three")],
    } } };
  } }, async () => {
    const records = await locationRecords({ limit: 1, maxPages: 2 });
    assert.deepEqual(records.map((record) => record.address).sort(), ["one", "two"]);
    assert.equal(calls, 2);
  });
});

test("an incomplete crawl reports truncation instead of implying a full market", async () => {
  await withFetch({ "/graphql": { data: {
    legacy: { pageInfo: { hasNextPage: true }, edges: [{ cursor: "more", node: {
      id: "one", owner: { address: "one" }, block: { timestamp: 1 }, tags: []
    } }] },
    current: { pageInfo: { hasNextPage: false }, edges: [] },
  } } }, async () => {
    const records = await locationRecords({ maxPages: 1 });
    assert.equal(records.truncated, true);
  });
});

test("a registry failure is not reported as an empty registry", async () => {
  await withFetch({ "/graphql": "throw" }, async () => {
    await assert.rejects(locationRecords({}), /registry query failed/);
  });
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
    {},
    async () => {
      assert.equal(await probeTunnel("https://not-a-tunnel.example"), null);
    },
  );
});

test("a tunneled phone with its own client pool is not listed as a provider", async () => {
  await withFetch(
    {
      "/graphql": graphqlReply([{ url: "https://phone.smoke.solutions", address: "PHONE" }]),
      "/~tunnel@1.0/status": {
        "open-registrations": 0, "open-client-pools": 1, "open-client-workers": 8, status: 200,
      },
      "/~meta@1.0/info/on/request": { "1+link": "client-hook", status: 200 },
      "/~meta@1.0/info/address": "PHONE",
    },
    async () => {
      const result = await discoverTunnels({});
      assert.equal(result.candidates, 1);
      assert.deepEqual(result.tunnels, []);
    },
  );
});

test("a provider's numbered request-hook links are materialized on the same node", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 1, status: 200 },
      "/~meta@1.0/info/on/request/1": { device: "manifest@1.0", status: 200 },
      "/~meta@1.0/info/on/request/2": routerHook,
      "/~meta@1.0/info/on/request": {
        "1+link": "opaque-first-hook", "2+link": "opaque-tunnel-hook", status: 200,
      },
    },
    async () => {
      const probe = await probeTunnel("https://linked-router.example");
      assert.equal(probe.peer, "https://linked-router.example");
      assert.equal(probe.registrations, 1);
    },
  );
});

test("a numbered client hook does not make a tunneled phone a provider", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": {
        "open-registrations": 0, "open-client-pools": 1, status: 200,
      },
      "/~meta@1.0/info/on/request/1": { device: "tunnel@1.0", path: "connect", status: 200 },
      "/~meta@1.0/info/on/request": { "1+link": "opaque-client-hook", status: 200 },
    },
    async () => assert.equal(await probeTunnel("https://linked-client.example"), null),
  );
});

test("a new router with no registrations keeps its listing when its request hook is present", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 0, status: 200 },
      "/~meta@1.0/info/on/request": [
        { device: "manifest@1.0" }, routerHook,
      ],
    },
    async () => {
      const probe = await probeTunnel("https://new-router.example");
      assert.equal(probe.registrations, 0);
      assert.equal(probe.peer, "https://new-router.example");
    },
  );
});

test("a status response without a tunnel request hook is not provider evidence", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 99, status: 200 },
      "/~meta@1.0/info/on/request": { device: "manifest@1.0", status: 200 },
    },
    async () => assert.equal(await probeTunnel("https://not-a-router.example"), null),
  );
});

test("a router reports its live pin and registration count, and no price", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 16, status: 200 },
      "/~meta@1.0/info/on/request": routerHook,
      "/~meta@1.0/info/trusted-devices/tunnel%401.0": "PINPINPIN\n",
    },
    async () => {
      const probe = await probeTunnel("https://router.example/");
      assert.equal(probe.peer, "https://router.example");
      assert.equal(probe.impl, "PINPINPIN");
      assert.equal(probe.registrations, 16);
      assert.ok(!("free" in probe) && !("rates" in probe), "tunnels carry no price");
    },
  );
});

test("an unreadable pin is reported as unknown, not guessed", async () => {
  await withFetch(
    {
      "/~tunnel@1.0/status": { "open-registrations": 1, status: 200 },
      "/~meta@1.0/info/on/request": routerHook,
      // Device names contain `@`, which a node renders into an illegal HTTP
      // header name; strict clients reject the whole response.
      "/~meta@1.0/info/trusted-devices": "throw",
    },
    async () => {
      const probe = await probeTunnel("https://noping.example");
      assert.equal(probe.impl, null);
      assert.doesNotMatch(asTunnelEntry(probe).note, /implementation pin unavailable/);
    },
  );
});

test("a discovered router is shaped like a built-in one", () => {
  const entry = asTunnelEntry({
    peer: "https://x.example", impl: "PIN", registrations: 1,
  });
  for (const key of ["id", "name", "peer", "impl", "registrations", "note"]) {
    assert.ok(key in entry, `missing ${key}`);
  }
  assert.equal(entry.name, "x.example");
  assert.equal(entry.discovered, true);
  assert.equal(entry.registrations, 1);
  assert.ok(!("free" in entry), "tunnels carry no price");
  assert.doesNotMatch(entry.note, /price|payment/);
  assert.match(entry.note, /measurement not verified/);
  assert.equal(entry.verified, false);
});

test("hosts nobody else can reach are discarded", async () => {
  const junk = [
    "http://localhost:8734", "http://127.0.0.1:9000", "http://10.1.2.3:8734",
    "http://192.168.1.185:8734", "http://172.20.0.5:8734", "http://169.254.1.1:8734",
    "http://ao-su:9000", "https://box.local:8734", "https://100.64.1.2",
    "https://user:pass@public.example", "http://[fd00::1]",
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

test("a higher nonce wins even when GraphQL timestamps arrive out of order", async () => {
  await withFetch({ "/graphql": graphqlReply([
    { url: "https://new.example", address: "NODE", id: "new", nonce: 9, published: 1000 },
    { url: "https://old.example", address: "NODE", id: "old", nonce: 8, published: 2000 },
  ]) }, async () => {
    const records = await locationRecords({});
    assert.equal(records.length, 1);
    assert.equal(records[0].url, "https://new.example");
  });
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

test("matching the signer proves no measurement verdict", async () => {
  await withFetch(
    {
      "/graphql": graphqlReply([{ url: "https://honest.example", address: "NODEADDR" }]),
      "/~tunnel@1.0/status": { "open-registrations": 2, status: 200 },
      "/~meta@1.0/info/on/request": routerHook,
      "/~meta@1.0/info/address": "NODEADDR",
    },
    async () => {
      const { tunnels, identityMismatches } = await discoverTunnels({});
      assert.equal(tunnels.length, 1);
      assert.equal(tunnels[0].identityMatch, true);
      assert.equal(tunnels[0].measurementVerified, false);
      assert.equal(identityMismatches, 0);
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
      "/~meta@1.0/info/on/request": routerHook,
      "/~meta@1.0/info/address": "THE-REAL-NODE",
    },
    async () => {
      const { tunnels, identityMismatches } = await discoverTunnels({});
      assert.equal(tunnels[0].identityMatch, false);
      assert.equal(tunnels[0].claimedBy, "IMPOSTOR");
      assert.equal(identityMismatches, 1);
      assert.match(asTunnelEntry(tunnels[0]).note, /signed by another address/);
    },
  );
});

test("a competing URL claim cannot displace the real node's listing", async () => {
  await withFetch({
    "/graphql": graphqlReply([
      { url: "https://provider.example", address: "REAL", id: "real", published: 1000 },
      { url: "https://provider.example", address: "IMPOSTOR", id: "fake", published: 2000 },
    ]),
    "/~tunnel@1.0/status": { "open-registrations": 2 },
    "/~meta@1.0/info/on/request": routerHook,
    "/~meta@1.0/info/address": "REAL",
  }, async () => {
    const result = await discoverTunnels({});
    assert.equal(result.candidates, 2);
    assert.equal(result.tunnels.length, 1);
    assert.equal(result.tunnels[0].claimedBy, "REAL");
    assert.equal(result.tunnels[0].identityMatch, true);
    assert.equal(result.tunnels[0].measurementVerified, false);
  });
});

test("a bounded probe reports that the provider list is incomplete", async () => {
  await withFetch({
    "/graphql": graphqlReply([
      { url: "https://one.example", address: "ONE", published: 2000 },
      { url: "https://two.example", address: "TWO", published: 1000 },
    ]),
    "/~tunnel@1.0/status": { "open-registrations": 1 },
    "/~meta@1.0/info/on/request": routerHook,
    "one.example/~meta@1.0/info/address": "ONE",
  }, async () => {
    const result = await discoverTunnels({ maxProbes: 1 });
    assert.equal(result.candidates, 2);
    assert.equal(result.probed, 1);
    assert.equal(result.incomplete, true);
  });
});

test("matching location identities sort above mismatches", async () => {
  await withFetch(
    {
      "/graphql": graphqlReply([
        { url: "https://busy-fake.example", address: "IMPOSTOR" },
        { url: "https://quiet-real.example", address: "REAL" },
      ]),
      "busy-fake.example/~tunnel@1.0/status": { "open-registrations": 99, status: 200 },
      "quiet-real.example/~tunnel@1.0/status": { "open-registrations": 1, status: 200 },
      "/~meta@1.0/info/on/request": routerHook,
      "busy-fake.example/~meta@1.0/info/address": "SOMEONE-ELSE",
      "quiet-real.example/~meta@1.0/info/address": "REAL",
    },
    async () => {
      const { tunnels } = await discoverTunnels({ concurrency: 1 });
      // Busiest would put the impostor first; verification must outrank it.
      assert.equal(tunnels[0].peer, "https://quiet-real.example");
      assert.equal(tunnels[0].identityMatch, true);
    },
  );
});

test("RC4 bundled responses and scalar address wrappers need no forced tunnel pin", async () => {
  await withFetch({
    "/~tunnel@1.0/status": { body: { "open-registrations": 16 } },
    "/~meta@1.0/info/on/request": { body: [routerHook] },
    "/~meta@1.0/info/address": { "ao-result": "body", body: "native-node" },
  }, async () => {
    const probe = await probeTunnel("https://smoke.solutions");
    assert.equal(probe.registrations, 16);
    assert.equal(probe.address, "native-node");
    assert.equal(probe.impl, null);
  });
});
