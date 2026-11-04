# Location records and tunnel discovery

This is the discovery contract for the AndEE Configurator. It uses the existing HyperBEAM `location@1.0` record in the pinned v0.11 source (`178fec98d8f5ac3843534752d1047a8bed51df06`). It does not create a second location protocol.

## Record

The current producer signs an AO message with `data-protocol=ao`, `variant=ao.N.1`, `type=location`, `url`, `nonce`, `time-to-live`, and `codec-device`. Its signer is the node identity. The Arweave item ID and block timestamp identify the published copy. Older records use `Type=Location` or `Type=Scheduler-Location` and `Url`/`Time-To-Live` tags; a crawler should read both during migration.

For a public tunnel listing, the URL must be an HTTPS endpoint reachable by an ordinary browser, with no credentials or private/local address. Configure `location-url` explicitly; do not let the node publish a localhost default. Set `location-ttl` explicitly **in milliseconds**, and republish before it expires. Older builds used inconsistent fallback units. The provider profile sets 28 days explicitly as `2419200000` milliseconds; inspect the exact deployed build when reading older records.

For each signer, a higher signed nonce supersedes an earlier record. Publication time helps sort GraphQL results but is not a substitute for nonce or signature validation. A signed record says where its signer claims to be; it says nothing about the endpoint's measurement, devices, uptime, or price. The current browser finder consumes GraphQL owner and tags as discovery data; it has **not** independently verified item bytes or AO signatures. An independently verified directory or client-side item verification is required for trusted admission.

## Crawl and probe

1. Page both tag schemas using GraphQL cursors. Bound pages, timeout, and concurrent probes. Keep one latest candidate per signer. If two signers claim the same URL, keep both claims until the endpoint's identity is checked. The browser finder stops after five pages and probes at most 60 recent candidates; it explicitly says when that view is incomplete. A network-wide market needs the cached crawler discussed in the call, with a complete crawl and freshness evidence.
2. Reject localhost, private/link-local/CGNAT addresses, credentials, unsafe schemes, and redirects. HTTPS is required for a public browser-facing market. DNS rebinding and CORS still require a trusted network-side crawler or tighter browser policy.
3. Probe `~tunnel@1.0/status`, `~meta@1.0/info/on/request`, `~meta@1.0/info/address`, and the scalar trusted-device path `/~meta@1.0/info/trusted-devices/tunnel%401.0`. Both public routers and tunneled clients load `tunnel@1.0`, so a status response alone cannot distinguish them. Require an `on.request` hook with `device=tunnel@1.0` and `path=request` for a public router candidate, including a router with zero current registrations. HyperBEAM may serialize the ordered hook list as `1+link`, `2+link` instead of inline objects. Resolve only numbered entries, on the same endpoint, with a limit of 16; do not follow the link values. That hook is still the endpoint's configuration claim, not an independent capability or measurement verdict. Signer/address equality is an identity consistency check, not measurement verification.
4. For **measured-provider eligibility**, obtain a fresh `~measurement@1.0` challenge and have a verifier independent of the discovered node validate its signature, nonce, certificate/evidence chain, measured body, backend and platform policy. Bind the accepted node identity to the signed location record and reached endpoint. Inspect the verified body for the trusted device pin and policy-relevant capabilities, then use a live service probe to confirm the device works. No browser-only shortcut may call a self-reported `measurement-device` a verdict.
   Show a green check in the tunnel picker only while that independent verdict is current and bound to the listed node identity, endpoint and implementation pin. Show no check for every other candidate, including a reachable plain VPS, an expired verdict, or an endpoint that merely answers `~measurement@1.0/info`. Keep the verifier identity, evidence ID, policy and expiry available for inspection with the badge. The current finder has no independent verifier feed, so it gives no tunnel a green check yet.
5. Cache candidate discovery with explicit crawl time and expiry. Refresh identity, measurement, capability, pin and health before selection. Expired records, unreachable endpoints and rejected measurements need distinct states; a cached listing must not silently become eligible.

The first public release can use a curated starter tunnel while these market-admission checks are completed. The Configurator finder currently provides **candidate discovery**, not measured market admission. It displays the verification limit in the picker and the crawl limit below the search control.

## Acceptance cases

- A paginated crawl finds a new node beyond the first page of either schema.
- A republished record with a higher nonce replaces an older URL for the same signer; a stale or expired record is not eligible.
- A forged record pointing at another node cannot displace that node's real listing.
- A reachable bare HyperBEAM node is never labelled measured PermawebOS.
- A tunneled AndEE with a client pool and `~tunnel@1.0/status` is not listed as a router without the public `on.request` hook; a new router with zero registrations remains discoverable when it has that hook.
- A router whose `on.request` list is represented by numbered `+link` fields remains discoverable after bounded same-origin materialization; a linkified client hook remains excluded.
- A measured provider is rejected if its fresh evidence fails policy or its trusted tunnel pin differs from the live implementation.
- A green check appears only for a current independent measurement verdict bound to the selected provider; removing or expiring that verdict removes the check.

Source checks: pinned HyperBEAM `src/preloaded/node/dev_location.erl`; Gold PermawebOS `devices/common/src/security/dev_measurement.erl` and `arch/android/specs/andee-device-specification.md`; August 10 physical LapEE location item `9Be-civMMQJsXt85aS28zZey3cHqCWOwQm9-v36vudA`.

## Provider boot default

Use the current HyperBEAM [provider profile](https://permawebos.arweave.net/configs/tunnel-provider.json)
and [setup guide](https://permawebos.arweave.net/#/run/docs/tunnel-providers).
It installs `tunnel@1.0/request` and a signed `location@1.0/node` startup hook,
sets the public broker URL, uses ANS-104 publication and explicitly sets a
28-day TTL in milliseconds. Provider recipes include that hook by default;
`connect` configures an origin using a broker and is not a provider recipe.

After boot and gateway indexing, **Scan for alternative tunnels** queries the record and probes
the broker. Zero registrations are valid for a new provider. The preloaded
tunnel device does not require a remote implementation pin, and this finder
accepts a missing `trusted-devices.tunnel@1.0` value. Its request-hook and
identity checks still apply. Keep HTTPS/CORS and the scalar metadata paths
available at the broker's public origin. The browser's bounded search can be
incomplete, so failure to list is not proof that publication failed.

A boot hook alone is not a perpetual renewal mechanism. Renew with fresh
operator-signed controls before the TTL expires; an unsigned cached read or a
replayed static signed cron request is not a renewal. Verify upload/indexing,
not just the locally returned location record.

The default reader first queries Arweave directly. If that request fails, it
restarts the same bounded crawl through Mystical's existing `relay@1.0` call,
with a fixed `relay-path` to `https://arweave.net/graphql` and `relay-method=POST`.
This is the same location index and JSON query, not a second provider list.
Cursors are never mixed between endpoints. An explicit caller-selected index
is respected, and cancellation does not start the fallback. Live probes still
check provider role and identity before offering the result.
