# andee-configurator

Operator-config builder for a **PermawebOS Node** running on Android.

Open **Configure** in AndEE, choose a profile, and select **Apply to AndEE**.
The existing next-boot store stages it; return to **Apply & close**, then reopen
AndEE. In a standalone browser the same action downloads `next.json` for the
**Load JSON** picker. Nothing is uploaded by this form.

**Full** is first and selected by default. It combines Ouroboros, agent,
inference, Intelligence Pool, Ouroboros Space and Weavemail with the existing
GC-free staked-bundler and native tunnel composition. Enter the extension's
public Arweave wallet address once; this owns the agent and subscription, and
is also the default payout address. Bundler settings allow a separate payout.
ChatGPT sign-in happens in the extension after boot; there is no callback URL
field or boot-time login. Optional API-key providers use private configuration;
preview and clipboard redact the key, while download/apply include it.

The checked-in deployment uses the published, verified device packages.
Full needs only your public extension wallet address. Its opening checklist
walks through applying the configuration, reopening AndEE, and connecting
ChatGPT in the extension. Empty or invalid addresses cannot be applied.
Missing device pins also disable saving; local test manifests cannot be published.

## Run

```sh
npm run serve   # http://127.0.0.1:5482/
npm test        # node:test suite
npm run check   # syntax check
```

No build step. It is plain ES modules and one stylesheet.

## Staked bundler candidate

**Staked bundler** is the second profile, for a setup without the agent. It composes
paid bundling and tunnel startup. Enter your payout address before downloading;
it may differ from the wallet used to stake. There is no deployment-supplied
payout fallback. Selecting another capability replaces this preset.

The hosting deployment supplies `deployment.json` beside `index.html`, with
`version: 1`, a release mode, a tunnel HTTPS peer, an upload gateway,
`agent.devices` specification/implementation pins, reviewed payment pins and
reservation amount. Missing or invalid settings disable the download. Production
pricing, funding and device publication remain separate release gates.

The deployment does not select a zone or supply the payout address. The preset
emits no `zone-allow`, ring pin, zone startup or zone retry schedule. It preserves
`allow-rejected-peer-attestation: false`; native zone admission still enforces
its policy. The existing AO staking flow discovers approved zones from the
registry and calls the node's join endpoint with the selected zone's peer and
expected ring address, then registers the node, obtains its signed membership
proof and submits the stake. The browser coordinates this flow; it does not
replace the zone's admission checks.

The generated `next.json` contains no phone address or public URL. A compatible
AndEE build supplies the pinned tunnel implementation with its `start` handler,
plus the native zone device selected by the staking UI. Tunnel startup derives
the URL from the selected peer and node identity. The configurator does not
prove reachability, admission, staking, routing eligibility or AR funding.

Apply in AndEE, or import the download with **LOAD JSON**. Choose **APPLY &
CLOSE**, then reopen AndEE. Copy the public URL from AndEE, open
[AO bundler staking](https://ao.arweave.net/#/stake/bundle), connect your staking
wallet and follow its zone/join/stake flow. Allow Android notifications to see
the running node's URL outside the app. Fresh-boot rejoining and stake rebinding
must be validated separately; the configurator does not install a fixed-zone
rejoin policy.

The profiles below are retained legacy presets; they do not describe this
v0.11 Staked bundler preset.

Tunnel provider setup is documented in the [PermawebOS tunnels guide](https://lapee.hyperbeam.online/#/run/docs/tunnels). The LapEE operator example is `sample-configs/lapee-tunnel-provider.json` in `arweave://lapee`. The Configurator builds client configs; it does not package provider files.

## What it produces

An **operator** config. The node merges it over its measured base config on the
next boot. That distinction matters:

- Storage and loader keys are **reserved** — `store`, `match-index`,
  `priv-store`, `arweave-index-store`, `preloaded-store`, `store-defaults`,
  `load-remote-devices` and friends. The Android boot-config store strips them
  from operator configs and restores the measured base values. This tool never
  emits them, and a test asserts that for every profile.
- Everything else merges, including `on/start` hooks, which are appended ahead
  of the base hooks (boot measurement, zone start).

## Profiles

| Profile | What you get |
| --- | --- |
| Plain node | Local only. No tunnel, no zone. |
| Tunnelled node | Public URL via the tunnel router. |
| Zone member | Tunnelled, joins a zone on boot. |
| Zone host | Tunnelled, may create a zone (`zone-init-allow`). |
| Bundler | Paid-bundler profile behind a tunnel. |
| Bundler in a zone | All of the above. |

## The zone

The legacy presets contain these `permawebos` defaults. Their present
availability and security policy must be checked before use:

| | |
| --- | --- |
| peer | `https://qd5thgjy7vkcr6pp2hyvqgardhrc426tjjaobbnetv7ctwrdsqda.smoke.solutions` |
| ring | `isUcx_QUq_XY-Wdxk66D6FMgoyANEdsgV2na2VDZuTk` |
| template | `measurement-device: andee@1.0` |

That legacy template selects `~measurement@1.0/verify-peer`. With the v0.11
staked preset, ao-site selects the zone during staking; selecting a configurator
preset alone is not evidence of hardware verification or membership.

**Its peer URL is derived from the hosting node's address**, so it holds only
while that node keeps its identity. Wiping the host's app data mints a new
address and the URL stops resolving.

## Notes worth keeping

- **The legacy paid profile bootstraps its bundler device.** `~bundler@1.0` is assembled at boot:
  the `lapee-p4-bootstrap@1.0` start hook installs it, and `trusted-devices` /
  `name-resolvers` pin the payment, pricing, settlement and GC devices it needs.
- **The Bundler card has no fixed price control.** P4 routes bundle uploads to
  `arweave-byte-pricing@1.0`, which quotes Arweave bytes in AO base units at
  request time. `simple-pay-price` and `router-opts/offered[].price` remain 0,
  matching the reference paid profile. The latter is a relative router ranking
  signal; it is not the paid upload quote or an operator payout setting.
- **`render-index-page` does nothing.** It appears in shipped configs and looks
  like the switch for the hyperbuddy UI, but the key does not exist in the
  pinned HyperBEAM. `default-index` is the one actually read, which is what the
  "do not serve hyperbuddy" option sets.
- **`load-remote-devices` also does nothing** in this build, for the same
  reason. Remote device loading is governed by `trusted-devices` and
  `trusted-device-signers`.
- **The tunnel implementation is repinned periodically.** If registration fails
  before any device is contacted, a stale `tunnel@1.0` pin is the usual cause;
  check what the router currently trusts at
  `<router>/~meta@1.0/info/trusted-devices/tunnel%401.0`.
- **The tunnel defaults to eight workers.** Bazar opens four gateway reads at
  once during startup, and the router rejects work beyond the registered
  worker pool instead of queueing it. Eight leaves room for that burst and
  background traffic; paid-router starter quotas must be sized for the higher
  idle registration traffic.

## Layout

```
index.html            markup
styles.css            mobile-first, light and dark
src/presets.js        device pins, zones, profile list
src/build-config.js   choices -> config (no DOM, unit-tested)
src/app.js            DOM wiring
test/                 node:test
```

Derived from the LapEE `os-node-config` tool, with the disk-image half removed:
that one opens a raw node image, finds the FAT EFI partition and patches
`EFI/boot/config.json` and `wifi.conf` in place. On Android there is no image to
patch — the node imports a JSON — so the FAT/GPT reader and the wifi editor are
gone.

## Deploying and the Android pin

Run `npm ci` to install the pinned publishing dependency. Set
`ANDEE_DEPLOY_WALLET` explicitly to the approved publishing wallet and
`ANDEE_DEPLOY_RECEIPT` to a file under `build/`. Run
`ANDEE_DEPLOY_DRY_RUN=1 node deploy.mjs` to validate the complete asset set and
public deployment without signing or uploading.

`deploy.mjs` signs and uploads each static asset, including `deployment.json`, through a bundler, then
uploads an Arweave path manifest. Every publication gets a new immutable
manifest ID. Android's Configure button opens `ConfiguratorActivity` at
`https://arweave.net/Pa3OuFqmwvueGE0ROLMofBVeCQX4NOseP1CMLKLn9qs/`, so
local source changes do not alter the page already installed on a phone.

After reviewing and authorizing a new publication, publish the static assets,
verify the new manifest and all module paths, update Android's
`CONFIGURATOR_URL` to that manifest ID, rebuild the app, and test the published
page in both a standalone browser and AndEE's Configure → Apply to AndEE →
Apply & close → reopen flow. See [the 2026-10-28 release evidence](review/full-release-20261028.md)
for the published device set, validation and installed APK.

Two traps worth knowing:

- **Always `curl -L`.** Gateways answer a bare id with a 302 to a sandbox
  subdomain. Without `-L` you get a 748-byte CDN error page and will conclude
  a perfectly healthy deploy is dead. That misdiagnosis has already happened
  once.
- **Every module `app.js` imports must be in `FILES`.** A manifest missing one
  entry fails as a blank page, not a 404, because the module graph cannot
  resolve. `theme.js` and `andee-phone.js` were missing until 2026-08-06.
