# andee-configurator

Operator-config builder for a **PermawebOS Node** running on Android.

Pick capabilities, fill in their fields, download `next.json`, and import it
with AndEE's LOAD CONFIG picker. The Configurator opens in a separate browser;
it does not connect directly to the phone or upload the generated config.

## Run

```sh
npm run serve   # http://127.0.0.1:5482/
npm test        # node:test suite
npm run check   # syntax check
```

No build step. It is plain ES modules and one stylesheet.

## Staked bundler candidate

**Staked bundler** is the first capability and the default selection. It composes
the v0.11 tunnel startup, zone admission and a 30-second zone retry using the
existing apply and cron devices. It is a complete preset; selecting another
capability replaces it.

The hosting deployment supplies `deployment.json` beside `index.html`:

```json
{
  "version": 1,
  "mode": "lab",
  "tunnel": { "peer": "https://tunnel.example", "implementation": "<43-character implementation ID>" },
  "zone": { "name": "test-zone", "peer": "http://192.168.1.2:8734", "ring": "<43-character ring address>" },
  "gateway": "http://192.168.1.2:36245",
  "stakingUrl": "http://192.168.1.2:5484"
}
```

Use real deployment values; the example placeholders deliberately fail
validation. Missing or invalid deployment settings disable the download. This
candidate accepts lab deployments with a private mock upload gateway only;
production funding and deployment settings remain separate release gates.

The generated `next.json` contains no phone address or public URL. A compatible
AndEE build must provide the pinned tunnel implementation with its `start`
handler, zone@1.3, apply@1.0 and cron@1.0. Tunnel startup derives the URL from the
selected peer and the node identity. The configurator does not prove that URL
is reachable or that zone admission has succeeded.

Download the config, select it with AndEE's **LOAD CONFIG**, choose **APPLY &
CLOSE**, then reopen AndEE. Copy the public URL from AndEE for the staking page.
Allow Android notifications to see the running node's URL outside the app.

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

That legacy template selects `~measurement@1.0/verify-peer`. The v0.11 preset
instead uses the deployment's zone and its admission policy; selecting a preset
alone is not evidence of hardware verification or membership.

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

`deploy.mjs` signs and uploads each static asset through a paid bundler, then
uploads an Arweave path manifest. Every publication gets a new immutable
manifest ID. The current Android `OrnamentActivity` opens the fixed URL
`https://arweave.net/BD8gs73YRzTwOJ0YpDTE3DOxjbQQ8vhhgIVJc11T_mA/`, so
local source changes do not alter the page already installed on a phone.

After reviewing and authorizing a new publication, publish the static assets,
verify the new manifest and all module paths, update Android's
`CONFIGURATOR_URL` to that manifest ID, rebuild the app, and test its separate
browser and LOAD CONFIG flow. The local static review bundle contains no signed
data-item IDs; those only exist after publication.

Two traps worth knowing:

- **Always `curl -L`.** Gateways answer a bare id with a 302 to a sandbox
  subdomain. Without `-L` you get a 748-byte CDN error page and will conclude
  a perfectly healthy deploy is dead. That misdiagnosis has already happened
  once.
- **Every module `app.js` imports must be in `FILES`.** A manifest missing one
  entry fails as a blank page, not a 404, because the module graph cannot
  resolve. `theme.js` and `andee-phone.js` were missing until 2026-08-06.
