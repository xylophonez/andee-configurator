# Package retrieval through the native Arweave index

The phone-compatible HyperBEAM revision f76a05f55de57bba2b0c83d4c450b43d1034c97b expects `data-length` in the native remote-offset HEAD response. The public gateway has returned `content-length` without that field, and its legacy raw route has also returned `checkout_timeout`. Correct published packages therefore remain undiscoverable through that route.

This change composes the existing `apply@1.0` and `copycat@1.0` devices in generated startup configuration. Release metadata records the confirmed block for each immutable pin. Only selected blocks are shallow-indexed; each request has identical explicit `from` and `to` and `reindex:false`. The hooks precede the existing payment bootstrap and tunnel hooks and preserve their input. No device implementation, signature, pin, store configuration or trust policy changes.

Full selects 24 unique specification/implementation IDs across four blocks: 2031295 (RC8), 2030648 (Pool/payment updates), 2025980 (pricing/oracle), and 1940677 (settlement). The regression test requires every current Full pin to have confirmation metadata. Custom operator pins retain normal retrieval behavior.

## Validation

- All 80 Configurator tests and syntax checks pass; publication dry run validates 11 static files plus manifest without signing/uploading.
- Unchanged f76 host runtime: all 24 original ANS-104 wrappers pass signature verification and the native `hb_store_arweave:read` expected-ID check. All 15 configured device names/aliases load with their existing pins.
- Independent arbundles verification passes all 24 original IDs/signatures and rejects all 24 copies with a deliberately corrupted payload byte.
- Two fresh Erlang VMs use the exact Android measured store, index and match definitions. Persistent LMDB remains between runs; volatile stores are recreated. All four block markers are absent before each run, then every package verifies and every alias loads. Index phases take 106.4 s and 61.7 s. The second run parses the exact generated Full JSON through `hb_opts:load` and executes its actual apply/copycat hook messages.
- Real API35 x86_64 emulator-5606 with provisional release APK SHA256 `58ed3f11748c2521a7429d36c12d09497ddedb979ff914f9b7290596f4da6b2a`: normal IMPORT_CONFIG review, Use This Setup, Apply & Close and ordinary reopen. Full configuration is 6372 bytes, SHA256/base64url `i0MAr-EvGBn-AZrrgYkbSRuUORY7NtxBOXFm-veopds`, disposable owner `Y6kigHC1IhY83IY4TAvJQ4vJKRSsvLtjo_dqceIFlxU`. No private store or package injection.
- The new configuration responds on local meta after 106.7 s; node identity is retained. The splash visibly shows NODE STARTING / Waiting for node discovery, then CONNECT YOUR NODE with the public tunnel URL. Public tunnel identity matches local identity.
- Ouroboros health and status both return 200, healthy with a ready root. First root creation exceeded a 25-second client request; subsequent status completes in 52 ms. All 24 native raw HTTP reads return 200 and exactly match the independently verified original signed payloads.
- Toolkit health is `missing`, as expected on this fresh emulator. No toolkit download or inference was requested in this package test; this does not claim fresh ARM64 tool execution.

Evidence is under `build/package-retrieval-20261029/`, including `android-topology-summary.json`, `independent-signature-check.json`, `emulator-all-package-readback.json`, status/tunnel metadata, screenshots and the bounded reproducible probe scripts.

## Startup and persistence

Android's index offsets and copycat completion markers share `andee-volatile-arweave-index-store`; both disappear on restart. There is no stale persistent completion marker that skips lost offsets. This also means block indexing runs again after a VM restart. A separate persistent host-index experiment skipped work in 138 ms, but that is not an Android boot claim.

`AndeeBootConfigStore.kt:127–132,190–206` restores and reserves `store`, `store-defaults`, `arweave-index-store` and related keys. Selecting a persistent LMDB index is not a supported operator-config workaround. No such override was added.

`HyperbeamRuntime.start` and `AndeeService` have no overall startup deadline. `NodeDiscovery.booting()` supplies the startup label, and OrnamentActivity continues bounded metadata polls without a terminal timeout. The startup screen remains generic; no per-package percentage is claimed.

## Publication handoff

Not published by this change. The existing release signing key is `/home/fn/.permagit/wallet.json`, public signer `y7iivTAENPj0fq-PJmIgnG8GY7ubDAqoVQwEfJM1TU8`.

After root confirms publication:

```sh
ANDEE_DEPLOY_WALLET=/home/fn/.permagit/wallet.json ANDEE_DEPLOY_RECEIPT=build/package-index-publication-20261029.json node deploy.mjs
```

The existing workflow signs 11 static ANS-104 assets plus a path manifest and submits them to `https://bundler.mystical.computer/~bundler@1.0/tx`. It does not create an AR transfer, fund an account, or quote the bundler's eventual mining cost. Record receipt IDs; if accounting is needed, inspect the enclosing confirmed L1 transaction rewards and bundle contents rather than inventing a zero cost or assigning an unrelated shared bundle's entire fee to this release. No reimbursement action is part of this command.

After byte-for-byte public asset readback, run the extension's `node scripts/sync-andee-configurator.mjs <manifest>`, set `applicationConfiguration.andee.configuratorUrl` to the same manifest and update the native Configurator URL. Rebuild/retest both ends before delivery. The application device packages do not need re-uploading.

## Composition review

Splash level: **2** (composition). Ladder rung: **(a)**. Adherence: **full**, unchanged from the upfront proposal. Scope agreed; precedent: f76 `dev_copycat_arweave.erl:445–570` shallow block indexing and `dev_apply.erl:111` pair composition, plus the prior verified single-block startup experiment. Owners: `copycat@1.0` indexing, `arweave@2.9`/`hb_store_arweave` verified retrieval, `apply@1.0`/`on.start` composition. Duplication: none. Root independently approved the composition shape and requested the real emulator acceptance. No Git push or publication performed.
