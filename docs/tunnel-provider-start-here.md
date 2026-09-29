# Run a tunnel provider

This pack is for the machine that accepts tunnel registrations from AndEE clients. The phone is a client; installing this config on the phone will not turn it into a provider.

This is a **transport and discovery pilot**. It does not configure a paid tunnel, prove independent measurement, or make a node eligible for a measured-provider badge. Those need the reviewed provider build, verifier and payment contract. See `technical-notes.md` for the evidence and current limits.

## In the pack

- `tunnel-provider-basic.json` — LapEE operator config template. Its public URL is deliberately a placeholder. The pinned tunnel implementation is from the August pilot; compare it with the implementation trusted by the provider build you will actually run.
- `check-config.py` — checks JSON shape, public URL, required tunnel/location hooks and keys that LapEE rejects. It does not contact or attest a node.
- `technical-notes.md` — topology choices, live checks, location publication and the Mystical broker investigation.

## Before you boot

1. Use a reviewed LapEE-capable machine with TPM 2.0, provisioned Secure Boot keys, a domain and wildcard TLS certificate. Decide whether a direct public edge or an outbound relay through an always-on LAN companion is needed. A plain VPS relay does not become the measured node.
2. Copy `tunnel-provider-basic.json` to `config.json`. Set `location-url` to your public HTTPS provider URL. Compare `trusted-devices.tunnel@1.0` and `trusted-device-signers` with your reviewed image. Keep the one-hour `location-ttl` only for a short pilot; continuous discovery needs signed renewal before expiry. The template contains no payment terms.
3. Run `python3 check-config.py config.json`. The unedited template deliberately fails because its URL is a placeholder. The checker cannot establish that the pin is current, the route works, or the host is measured.
4. In the matching LapEE source checkout, put `config.json` at the repository root, build the image, and stage the config on the signed image:

   ```sh
   make no-tme
   make qemu IMAGE=build/images/permawebos-no-tme-signed.img
   make operator-config-apply IMAGE=build/images/permawebos-no-tme-signed.img
   ```

   Use `make tme` and its matching image on hardware that supports the TME build. QEMU checks the image boot path; it does not establish Secure Boot trust or TPM measurement on your hardware. Check the USB target with `lsblk` and `/dev/disk/by-id/` before writing the image. Read back `/EFI/boot/config.json` from the stick. LapEE rejects the entire operator file if it contains reserved fields, so do not infer successful config import from a successful boot.
5. Terminate wildcard TLS at an operator-controlled public edge. Forward to the measured LapEE on port 8734. If inbound traffic is blocked, have an always-on LAN companion open the outbound leg to a public relay. Keep the provider's identity and signing material on the provider, not the relay.

## Prove the route

On the LAN, check the node address and `~tunnel@1.0/status`. On the public HTTPS URL, check the same address, the scalar tunnel implementation pin, and `/~meta@1.0/info/on/request/1` for `{device: "tunnel@1.0", path: "request"}`. Test both HTTP/2 and HTTP/1.1; a proxy that loses the original Host can appear healthy while it routes every client request to the broker itself.

The `location@1.0` start hook publishes a signed record on boot. Check the item signer, `url`, nonce, TTL and Arweave indexing before expecting the Configurator to discover it. A boot-only record with this template's one-hour TTL will go stale; arrange renewal before presenting the service as continuously available. Do not call `GET /~location@1.0/node` as a health check: that path can publish.

Finally, connect a disposable AndEE client and request `/~meta@1.0/info/address` through its `https://<client-b32>.<your-domain>/` URL. The reply must be the **client** address, not the provider address. Test reconnect after provider restart and confirm stale location records stop being offered. Have an independent verifier check fresh `~measurement@1.0` evidence and the trusted tunnel pin before treating the provider as measured. Price and payment terms require Sam's reviewed provider configuration; this pack does not supply them.
