# Tunnel provider setup pack

This pack covers the **provider** side of an AndEE tunnel. Put the public tunnel service on a measured LapEE or other reviewed PermawebOS host. The AndEE phone is the client: it connects out to the provider. The August LapEE pilot proved the transport and signed location publication on physical hardware. Payment to an independent operator remains dependent on Sam's reviewed charging and settlement configuration.

## Choose the route

If your router accepts inbound connections, forward public TCP 443 to the measured provider and terminate TLS there. If the site is behind CGNAT or filtered inbound, use an always-on LAN companion to initiate a connection to a public relay/VPS and forward it to the provider. The companion carries packets; it does not become the measured node. LapEE itself has no shell or WireGuard service for holding the outbound relay leg.

You need a dedicated LapEE-capable machine with TPM 2.0 and Secure Boot provisioned, a domain you control, DNS automation for a wildcard TLS certificate, a public endpoint, and reviewed device implementation pins. Keep operator signing material and any AR/AO funds under the operator's control. Use an isolated test node and disposable identity for the first run.

The adjacent [`tunnel-provider-basic.json`](./tunnel-provider-basic.json) is a **transport and discovery template**, not a paid provider profile. It pins the tunnel device used in the August pilot and starts `location@1.0` publication. Replace its URL and review its pin and signer against the actual provider build before applying it. It contains no payment hook or fee promise. Do not publish it as a paid service.

## Apply and check

1. Build and boot the reviewed LapEE image on the provider hardware. The detailed image, USB, Secure Boot and network procedures are in the existing physical pilot `PROVIDER-GUIDE.md` in `lapee-baseline-sam-20260721`; preserve that staged worktree. Check the TPM quote and measured boot before exposing the service.
2. Put the public HTTPS URL in `location-url`, and set DNS/TLS and the direct or companion route. Read back the operator config from the boot medium. The LapEE init rejects an entire invalid operator config; avoid reserved keys such as `measurement-body-source`.
3. Boot the provider. Check its public `~tunnel@1.0/status`, scalar tunnel pin under `~meta@1.0/info`, node address, and `~measurement@1.0` evidence. A live status response alone is not measured admission.
4. Publish the signed location record with the `POST`, `target: self`, `commit-request: true` start hook. Check the returned record's signer, URL, nonce, TTL and Arweave item. The pilot location item is `9Be-civMMQJsXt85aS28zZey3cHqCWOwQm9-v36vudA`.
5. Use a disposable AndEE client to register and send a synthetic request through the public HTTPS address. Check both request and response, the client's public URL, and the provider's registration count. Then test provider restart, client reconnect and stale-location behavior.
6. Before charging anyone, substitute a reviewed paid-provider config with the exact tunnel, metering, ledger and P4 pins, enforced price/terms, payment recipient, and settlement flow. The existing pilot paid-broker example has four unresolved implementation placeholders and token-gated quota; it is **not** an operator payout profile.

For rollback, restore the previous operator config and public edge route, restart the provider, and publish a fresh location record for the restored URL. If a key or device pin changes, force clients to refresh their configuration. Arweave's earlier location records remain visible; a newer signed nonce and expiry are how crawlers move on.

## What to hand to the market

Supply the node signer, public HTTPS URL, signed location item, measurement evidence, reviewed tunnel implementation pin, operational status, and enforced price/terms. The market must verify those facts independently before displaying the provider as eligible. The present browser finder can discover and probe candidates but cannot make that admission decision yet.
