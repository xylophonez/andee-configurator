// Find tunnel routers on the network instead of hard-coding them.
//
// Two steps, because the two facts live in different places. Which nodes exist
// is on Arweave and answerable by GraphQL; what a node charges is in its
// operator's config on its own disk and is never published, so it has to be
// asked for over HTTP. There is no query that answers both.
//
// The HTTP step is a probe, not a lookup. A location record says "a node is
// here"; it does not say the node is a tunnel, that it is alive, or what it
// costs. Every such claim is verified against the node that would have to
// honour it, seconds before anyone commits to using it. That also disposes of
// the obvious objection to an advertised price -- nothing is advertised.
//
// Reading the pin live is the real prize. `TUNNELS` in presets.js carries a
// hard-coded `impl` per router precisely because routers repin independently
// and a stale value fails before a device is ever contacted. A discovered
// router cannot be stale: its pin is read from the router itself.

const GATEWAY = "https://arweave.net";

// Location records surface on-chain in this form. `Url` is where the node
// claims to be; `Time-To-Live` is how long it claims that stays true.
const LOCATION_QUERY = `{
  transactions(tags: [{name: "Type", values: ["Scheduler-Location"]}], first: %LIMIT%) {
    edges { node { id owner { address } block { timestamp } tags { name value } } }
  }
}`;

// Hosts that cannot mean anything to someone else's browser. Records carrying
// them are already in the registry -- `http://127.0.0.1:9000`, `http://ao-su:9000`
// -- because a node with no location-url builds one from node_host and port,
// which default to localhost. They are published permanently and in good faith;
// they are still noise.
function unroutable(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "[::1]") return true;
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
 *  Records are deduplicated by URL and skipped when the page is served over
 *  HTTPS and the record points at HTTP: the browser would block the probe as
 *  mixed content, so offering the node would only produce a router that fails
 *  for reasons the user cannot see. Plenty of published records are `http://`
 *  or point at private hosts. */
export async function locationRecords({
  gateway = GATEWAY,
  limit = 100,
  timeoutMs = 15000,
  signal,
} = {}) {
  const body = JSON.stringify({ query: LOCATION_QUERY.replace("%LIMIT%", String(limit)) });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  signal?.addEventListener("abort", () => abort.abort(), { once: true });
  let payload;
  try {
    const res = await fetch(`${gateway}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: abort.signal,
    });
    payload = res.ok ? await res.json() : null;
  } catch {
    payload = null;
  } finally {
    clearTimeout(timer);
  }

  const edges = payload?.data?.transactions?.edges ?? [];
  const insecurePage =
    typeof location !== "undefined" && location.protocol === "https:";
  const now = Date.now();
  const best = new Map();
  for (const edge of edges) {
    const tags = Object.fromEntries(
      (edge.node.tags ?? []).map((tag) => [tag.name, tag.value]),
    );
    const url = String(tags.Url ?? "").trim().replace(/\/+$/, "");
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (unroutable(url)) continue;
    // A page served over HTTPS cannot probe an HTTP node: the browser blocks
    // it as mixed content, so offering it would produce a router that fails
    // for a reason the user cannot see.
    if (insecurePage && url.startsWith("http://")) continue;

    const ttl = Number(tags["Time-To-Live"] ?? 0) || 0;
    const published = Number(edge.node.block?.timestamp ?? 0) * 1000;
    const record = {
      url,
      address: edge.node.owner?.address ?? "",
      ttl,
      published,
      // Expiry is recorded, not enforced. Almost every record in the registry
      // has lapsed -- one-hour TTLs published months ago -- while its URL still
      // serves. The probe decides what is alive; this only ranks and explains.
      expired: Boolean(published && ttl && published + ttl < now),
      record: edge.node.id,
    };
    // One record per URL: the most recently published wins, so a node that
    // republishes supersedes its own older claim.
    const prior = best.get(url);
    if (!prior || record.published > prior.published) best.set(url, record);
  }
  return [...best.values()].sort((a, b) => b.published - a.published);
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

/** Ask one node whether it is a live tunnel router, and on what terms.
 *
 *  Returns null unless `~tunnel@1.0/status` answers with a registration count.
 *  That single fact is what separates a tunnel from any other node, and it is
 *  demonstrated rather than claimed -- there is no "I am a tunnel" tag to
 *  trust, and inventing one would be trusting it. */
export async function probeTunnel(url, { timeoutMs = 8000, signal } = {}) {
  const base = url.replace(/\/+$/, "");
  const [status, impl, rates, address] = await Promise.all([
    getJSON(`${base}/~tunnel@1.0/status`, timeoutMs, signal),
    // Single key, not the whole map -- see the header note above.
    getText(
      `${base}/~meta@1.0/info/trusted-devices/tunnel%401.0`,
      timeoutMs,
      signal,
    ),
    getJSON(`${base}/~meta@1.0/info/metering-rates`, timeoutMs, signal),
    // Who the node says it is. Compared against whoever signed the location
    // record; see `verified` in discoverTunnels.
    getText(`${base}/~meta@1.0/info/address`, timeoutMs, signal),
  ]);

  const registrations = Number(status?.["open-registrations"] ?? NaN);
  if (!Number.isFinite(registrations)) return null;

  const priced = Object.entries(rates ?? {})
    .filter(([key, value]) => key !== "status" && Number(value) > 0)
    .map(([key, value]) => [key, Number(value)]);

  return {
    peer: base,
    impl,
    address,
    registrations,
    // Free until proven otherwise: an absent rate folds to zero in
    // metering@1.0, so no priced resources genuinely means no charge.
    rates: Object.fromEntries(priced),
    free: priced.length === 0,
    // What the tunnel serves to the public arrives at the broker as the
    // tunnelled node's response POST, so egress is meta-bytes-in. Named here
    // because the inversion is the thing everyone gets wrong.
    egressRate: Object.fromEntries(priced)["meta-bytes-in"] ?? 0,
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
  concurrency = 6,
  timeoutMs = 8000,
  signal,
} = {}) {
  const candidates = await locationRecords({ gateway, limit, signal });
  const found = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      if (signal?.aborted) return;
      const candidate = candidates[cursor++];
      const probe = await probeTunnel(candidate.url, { timeoutMs, signal });
      if (!probe) continue;
      // Anyone can publish a record claiming any URL -- the record is signed by
      // its author, not by the node it names. A test node booted from a
      // production image will happily assert it is the production tunnel. So
      // ask the node who it is and require it to match the signer. A mismatch
      // is not a broken router, it is somebody else's claim about this one.
      const verified =
        Boolean(probe.address) && probe.address === candidate.address;
      found.push({
        ...probe,
        verified,
        claimedBy: candidate.address,
        expired: candidate.expired,
        published: candidate.published,
        record: candidate.record,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );

  // Verified first, then busiest. A router already carrying registrations has
  // demonstrated it works, which is worth more to someone choosing one than a
  // cheaper price on a node nothing has ever used.
  found.sort(
    (a, b) => Number(b.verified) - Number(a.verified) || b.registrations - a.registrations,
  );
  return {
    candidates: candidates.length,
    tunnels: found,
    unverified: found.filter((tunnel) => !tunnel.verified).length,
  };
}

/** Present a rate as money. One base unit per byte is ~$2/TB: an AO token is
 *  1e12 base units and trades around $2, so the two cancel to "units per byte
 *  times two dollars per terabyte". Approximate by construction -- the token
 *  price moves, and metered sizes are ETF-encoded rather than wire octets, so
 *  this is for comparing routers, not for predicting a bill. */
export function describePrice(tunnel, { tokenUSD = 2 } = {}) {
  if (!tunnel || tunnel.free) return "free";
  const rate = tunnel.egressRate;
  if (!rate) {
    const other = Object.keys(tunnel.rates).join(", ");
    return other ? `priced on ${other}` : "free";
  }
  const perTB = rate * tokenUSD;
  return perTB < 0.01
    ? `~$${perTB.toFixed(4)}/TB`
    : `~$${perTB.toFixed(2)}/TB`;
}

/** Shape a discovered router like a `presets.js` TUNNELS entry so the picker
 *  can render discovered and built-in routers through one code path. */
export function asTunnelEntry(tunnel) {
  const host = tunnel.peer.replace(/^https?:\/\//, "");
  const parts = [
    describePrice(tunnel),
    `${tunnel.registrations} node${tunnel.registrations === 1 ? "" : "s"} connected`,
  ];
  // Say what is wrong with it, not just that something is. A user choosing a
  // router can weigh "nobody vouches for this address" themselves; "suspicious"
  // tells them nothing and invites ignoring it.
  if (tunnel.verified === false) parts.push("unverified: record signed by another address");
  if (tunnel.expired) parts.push("record expired");
  if (!tunnel.impl) parts.push("implementation pin unavailable");
  return {
    id: `discovered:${host}`,
    name: host,
    peer: tunnel.peer,
    impl: tunnel.impl,
    discovered: true,
    verified: tunnel.verified !== false,
    note: parts.join(" · "),
  };
}
