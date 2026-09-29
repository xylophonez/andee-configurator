// Location records provide candidate endpoints. Live probes report what those
// endpoints say now. Neither is an independent measurement verdict or an
// enforceable price quote; the picker must keep those limits visible.

const GATEWAY = "https://arweave.net";

// Legacy scheduler records use title-case tags; current location@1.0 records
// use normalized lower-case tags. Read both while nodes transition.
const LOCATION_TAGS = {
  legacy: '[{name: "Type", values: ["Location", "Scheduler-Location"]}]',
  current: '[{name: "type", values: ["location"]}]',
};

function locationQuery(active, cursors, limit) {
  return `{ ${active.map((schema) => `${schema}: transactions(
    tags: ${LOCATION_TAGS[schema]}, first: ${limit}
    ${cursors[schema] ? `, after: ${JSON.stringify(cursors[schema])}` : ""}
  ) { pageInfo { hasNextPage } edges { cursor node {
    id owner { address } block { timestamp } tags { name value }
  } } }`).join("\n")} }`;
}

// Hosts that cannot mean anything to someone else's browser. Records carrying
// them are already in the registry -- `http://127.0.0.1:9000`, `http://ao-su:9000`
// -- because a node with no location-url builds one from node_host and port,
// which default to localhost. They are published permanently and in good faith;
// they are still noise.
function unroutable(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return true;
  if (parsed.username || parsed.password) return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  // Public providers use DNS names. Exclude IP literals in IPv6 form until a
  // parser can distinguish every mapped, private and link-local variant.
  if (host.includes(":")) return true;
  // A bare hostname with no dot is only resolvable inside whatever network
  // published it -- container names like `ao-su` reach nobody else.
  if (!host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

// A HyperBEAM node renders a returned map into HTTP *response headers* as well
// as the body. Device names contain `@`, which is not a legal character in an
// HTTP header name, so a response carrying `tunnel@1.0: <id>` is malformed and
// strict clients reject the whole response before the body is read -- Node's
// undici raises "Invalid header token". `accept-bundle` does not avoid it.
//
// So a map whose keys are device names cannot be fetched whole. Ask for the one
// key instead: `.../trusted-devices/tunnel@1.0` returns the value as the body
// with no exploded headers. `metering-rates` is fetched whole safely because
// its keys are ordinary tokens.

/** Fetch with a deadline. A discovery pass must not hang on one dead node, and
 *  many published locations are stale, private or plain unreachable. */
async function getJSON(url, timeoutMs, signal) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const onOuter = () => abort.abort();
  signal?.addEventListener("abort", onOuter, { once: true });
  try {
    const res = await fetch(url, {
      signal: abort.signal,
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuter);
  }
}

/** Candidate node URLs from published location records, newest first.
 *
 *  Records are superseded per signer and skipped when the page is served over
 *  HTTPS and the record points at HTTP: the browser would block the probe as
 *  mixed content, so offering the node would only produce a router that fails
 *  for reasons the user cannot see. Plenty of published records are `http://`
 *  or point at private hosts. */
export async function locationRecords({
  gateway = GATEWAY,
  limit = 100,
  maxPages = 5,
  timeoutMs = 15000,
  signal,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
    throw new RangeError("Invalid location crawl bounds");
  }
  const cursors = { legacy: null, current: null };
  const done = { legacy: false, current: false };
  const edges = [];
  for (let page = 0; page < maxPages; page++) {
    const active = Object.keys(done).filter((schema) => !done[schema]);
    if (signal?.aborted) throw new DOMException("Discovery cancelled", "AbortError");
    if (!active.length) break;
    const body = JSON.stringify({ query: locationQuery(active, cursors, limit) });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const onOuter = () => abort.abort();
    signal?.addEventListener("abort", onOuter, { once: true });
    let payload;
    try {
      const res = await fetch(`${gateway}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: abort.signal,
        redirect: "error",
      });
      payload = res.ok ? await res.json() : null;
    } catch {
      payload = null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuter);
    }
    if (!payload?.data || payload.errors?.length) {
      throw new Error("Location registry query failed");
    }
    for (const schema of active) {
      const result = payload.data[schema];
      if (!result?.pageInfo || !Array.isArray(result.edges)) {
        throw new Error("Location registry page is incomplete");
      }
      const batch = result.edges;
      edges.push(...batch);
      const next = batch.at(-1)?.cursor;
      if (result.pageInfo.hasNextPage && (!next || next === cursors[schema])) {
        throw new Error("Location registry returned no forward cursor");
      }
      done[schema] = !result.pageInfo.hasNextPage;
      if (!done[schema]) cursors[schema] = next;
    }
  }
  const insecurePage =
    typeof location !== "undefined" && location.protocol === "https:";
  const now = Date.now();
  const best = new Map();
  for (const edge of edges) {
    const tags = Object.fromEntries(
      (edge.node.tags ?? []).map((tag) => [tag.name, tag.value]),
    );
    const url = String(tags.Url ?? tags.url ?? "").trim().replace(/\/+$/, "");
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (unroutable(url)) continue;
    // A page served over HTTPS cannot probe an HTTP node: the browser blocks
    // it as mixed content, so offering it would produce a router that fails
    // for a reason the user cannot see.
    if (insecurePage && url.startsWith("http://")) continue;

    const ttl = Number(tags["Time-To-Live"] ?? tags["time-to-live"] ?? 0) || 0;
    const published = Number(edge.node.block?.timestamp ?? 0) * 1000;
    const rawNonce = tags.Nonce ?? tags.nonce;
    const parsedNonce = rawNonce === undefined ? null : Number(rawNonce);
    const nonce = Number.isSafeInteger(parsedNonce) && parsedNonce >= 0 ? parsedNonce : null;
    const record = {
      url,
      address: edge.node.owner?.address ?? "",
      nonce,
      ttl,
      published,
      // Expiry is recorded, not enforced. Almost every record in the registry
      // has lapsed -- one-hour TTLs published months ago -- while its URL still
      // serves. The probe decides what is alive; this only ranks and explains.
      expired: Boolean(published && ttl && published + ttl < now),
      record: edge.node.id,
    };
    // Supersession belongs to a signer. A stranger can publish the same URL;
    // keep that competing claim until the live identity check has run.
    const key = record.address || `unsigned:${record.record}`;
    const prior = best.get(key);
    if (!prior || (record.nonce !== null && prior.nonce !== null
      ? record.nonce > prior.nonce ||
        (record.nonce === prior.nonce && record.published > prior.published)
      : record.published > prior.published)) best.set(key, record);
  }
  const records = [...best.values()].sort((a, b) => b.published - a.published);
  Object.defineProperty(records, "truncated", {
    value: Object.values(done).some((value) => !value),
  });
  return records;
}

/** Fetch a single scalar as text. Used where a whole map cannot be requested
 *  because its keys would become illegal header names. */
async function getText(url, timeoutMs, signal) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const onOuter = () => abort.abort();
  signal?.addEventListener("abort", onOuter, { once: true });
  try {
    const res = await fetch(url, {
      signal: abort.signal,
      redirect: "error",
      headers: { accept: "text/plain" },
    });
    if (!res.ok) return null;
    const body = (await res.text()).trim();
    return body || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuter);
  }
}

// Routers and tunneled clients load the same device, so both answer status.
// The public router config installs this request hook; a client-side connect
// hook alone is not evidence that the URL can accept public tunnel traffic.
function hasTunnelRequestHook(hooks) {
  if (Array.isArray(hooks)) return hooks.some(hasTunnelRequestHook);
  if (!hooks || typeof hooks !== "object") return false;
  if (hooks.device === "tunnel@1.0" && hooks.path === "request") return true;
  return Object.entries(hooks).some(([key, value]) =>
    /^\d+$/.test(key) && hasTunnelRequestHook(value));
}

/** Ask one node whether it advertises the public tunnel handler.
 *
 *  Status is shared by routers and clients. A matching on-request hook is a
 *  configuration claim, not independent measurement or proof of delivery. */
export async function probeTunnel(url, { timeoutMs = 8000, signal } = {}) {
  const base = url.replace(/\/+$/, "");
  const [status, requestHooks, impl, rates, address] = await Promise.all([
    getJSON(`${base}/~tunnel@1.0/status`, timeoutMs, signal),
    getJSON(`${base}/~meta@1.0/info/on/request`, timeoutMs, signal),
    // Single key, not the whole map -- see the header note above.
    getText(
      `${base}/~meta@1.0/info/trusted-devices/tunnel%401.0`,
      timeoutMs,
      signal,
    ),
    getJSON(`${base}/~meta@1.0/info/metering-rates`, timeoutMs, signal),
    // Who the node says it is. Compared against whoever signed the location
    // record; see `identityMatch` in discoverTunnels.
    getText(`${base}/~meta@1.0/info/address`, timeoutMs, signal),
  ]);

  const registrations = Number(status?.["open-registrations"] ?? NaN);
  if (!Number.isFinite(registrations) || !hasTunnelRequestHook(requestHooks)) return null;

  const priced = Object.entries(rates ?? {})
    .filter(([key, value]) => key !== "status" && Number(value) > 0)
    .map(([key, value]) => [key, Number(value)]);

  return {
    peer: base,
    impl,
    address,
    registrations,
    // An unreadable rate map says nothing about payment terms.
    rates: Object.fromEntries(priced),
    free: priced.length ? false : null,
  };
}

/** Discover live tunnel routers with their pins and prices.
 *
 *  Probes run in bounded parallel: a discovery pass touches strangers' nodes,
 *  and firing a hundred requests at once is both slow through one browser
 *  connection pool and rude. */
export async function discoverTunnels({
  gateway = GATEWAY,
  limit = 100,
  maxPages = 5,
  maxProbes = 60,
  concurrency = 6,
  timeoutMs = 8000,
  signal,
} = {}) {
  if (!Number.isInteger(maxProbes) || maxProbes < 1 || maxProbes > 500 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new RangeError("Invalid tunnel probe bounds");
  }
  const candidates = await locationRecords({ gateway, limit, maxPages, signal });
  const probeCandidates = candidates.slice(0, maxProbes);
  const found = [];
  let cursor = 0;

  async function worker() {
    while (cursor < probeCandidates.length) {
      if (signal?.aborted) return;
      const candidate = probeCandidates[cursor++];
      const probe = await probeTunnel(candidate.url, { timeoutMs, signal });
      if (!probe) continue;
      // Anyone can publish a record claiming any URL -- the record is signed by
      // its author, not by the node it names. A test node booted from a
      // production image will happily assert it is the production tunnel. So
      // ask the node who it is and require it to match the signer. A mismatch
      // is not a broken router, it is somebody else's claim about this one.
      const identityMatch =
        Boolean(probe.address) && probe.address === candidate.address;
      found.push({
        ...probe,
        identityMatch,
        measurementVerified: false,
        claimedBy: candidate.address,
        expired: candidate.expired,
        published: candidate.published,
        record: candidate.record,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, probeCandidates.length) }, worker),
  );

  // Matching a location signer is useful but does not attest the machine.
  found.sort((a, b) => Number(b.identityMatch) - Number(a.identityMatch) ||
    b.published - a.published || b.registrations - a.registrations);
  const byURL = new Map();
  for (const tunnel of found) {
    if (!byURL.has(tunnel.peer)) byURL.set(tunnel.peer, tunnel);
  }
  const unique = [...byURL.values()];
  return {
    candidates: candidates.length,
    probed: probeCandidates.length,
    incomplete: Boolean(candidates.truncated) || probeCandidates.length < candidates.length,
    tunnels: unique,
    identityMismatches: unique.filter((tunnel) => !tunnel.identityMatch).length,
  };
}

/** Internal metering rates are not a price quote or settlement promise. */
export function describePrice(tunnel) {
  if (!tunnel || tunnel.free === null) return "price unavailable";
  return `metered on ${Object.keys(tunnel.rates).join(", ")}; terms unverified`;
}

/** Shape a discovered router like a `presets.js` TUNNELS entry so the picker
 *  can render discovered and built-in routers through one code path. */
export function asTunnelEntry(tunnel) {
  const host = tunnel.peer.replace(/^https?:\/\//, "");
  const warnings = [];
  // Say what is wrong with it, not just that something is. A user choosing a
  // router can weigh "nobody vouches for this address" themselves; "suspicious"
  // tells them nothing and invites ignoring it.
  if (tunnel.identityMatch === false) warnings.push("record signed by another address");
  if (tunnel.expired) warnings.push("record expired");
  if (!tunnel.impl) warnings.push("implementation pin unavailable");
  warnings.push("measurement not verified");
  if (tunnel.free === null) warnings.push("price unavailable");
  else if (!tunnel.free) warnings.push("payment terms unverified");
  return {
    id: `discovered:${host}`,
    name: host,
    peer: tunnel.peer,
    impl: tunnel.impl,
    registrations: tunnel.registrations,
    free: tunnel.free,
    discovered: true,
    verified: false,
    note: warnings.join(" · "),
  };
}
