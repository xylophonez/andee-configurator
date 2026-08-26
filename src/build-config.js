// Turn the form's choices into the operator config the node will import.
//
// Kept free of DOM access so it can be unit-tested directly under node.

import {
  BUNDLER_NAME_RESOLVERS,
  BUNDLER_TRUSTED,
  CAPABILITIES,
  OUROBOROS_NAME_RESOLVERS,
  OUROBOROS_TRUSTED,
  P4_BOOTSTRAP_DEVICE,
  PROFILES,
  TUNNEL_TRUSTED,
} from "./presets.js";

export const RESERVED_BOOT_KEYS = [
  "access-remote-cache-for-client",
  "arweave-index-blocks",
  "arweave-index-store",
  "arweave-scheduler-block-batch",
  "arweave-scheduler-block-workers",
  "arweave-scheduler-confirmation-depth",
  "arweave-scheduler-fetch-attempts",
  "arweave-scheduler-fetch-retry",
  "arweave-scheduler-from",
  "arweave-scheduler-header-workers",
  "arweave-scheduler-sync",
  "arweave-scheduler-sync-interval",
  "cache-control",
  "forge-bootstrap",
  "gateway",
  "http-extra-opts",
  "load-remote-devices",
  "loaded-device-store",
  "match-index",
  "measurement-body-source",
  "preloaded-devices-index",
  "preloaded-store",
  "priv-store",
  "route-owners",
  "routes",
  "scheduler-store",
  "store",
  "store-defaults",
  "trusted-device-signers",
];

export function profileById(id) {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}

export function capabilityById(id) {
  return CAPABILITIES.find((capability) => capability.id === id);
}

/**
 * @param {object} choices
 * @param {string[]} [choices.layers] ordered additive capability IDs
 * @param {string} [choices.profile] legacy exclusive preset ID
 * @param {"join"|"host"} [choices.zoneMode]
 * @param {string} [choices.tunnelPeer]
 * @param {number} [choices.tunnelWorkers]
 * @param {string} [choices.tunnelImpl]
 * @param {string} [choices.zoneName]
 * @param {string} [choices.zonePeer]
 * @param {string} [choices.beneficiary]
 * @param {number} [choices.price]
 * @param {number} [choices.maxItems]
 * @param {boolean} [choices.disableHyperbuddy]
 */
export function buildConfig(choices) {
  const legacyProfile = choices.profile ? profileById(choices.profile) : null;
  const layers = normalizeLayers(
    Array.isArray(choices.layers) ? choices.layers : layersForProfile(legacyProfile),
  );
  const zoneMode = choices.zoneMode || legacyProfile?.zone || "join";
  const activeLayers = new Set(layers);
  const config = {};
  const startHooks = [];
  const trusted = {};
  const nameResolverLists = [];

  // This is a semantic switch, not a device or tuning override. The AndEE
  // boot-config store expands it to the measured scheduler pin and settings.
  // Keeping false explicit makes removing the layer an actual toggle instead
  // of falling back to the base image's enabled default.
  config["andee-capabilities"] = {
    scheduler: activeLayers.has("scheduler"),
  };

  for (const layer of layers) {
    if (layer === "tunnel") {
      const peer = normalizePeer(choices.tunnelPeer);
      if (!peer) throw new Error("Tunnel peer is required when Public access is enabled.");
      startHooks.push({
        device: "tunnel@1.0",
        method: "POST",
        path: "connect",
        peer,
        workers: clampInt(choices.tunnelWorkers, 1, 32, 3),
        hook: { result: "ignore" },
      });
      Object.assign(trusted, TUNNEL_TRUSTED);
      if (choices.tunnelImpl && choices.tunnelImpl.trim()) {
        trusted["tunnel@1.0"] = choices.tunnelImpl.trim();
      }
    }

    if (layer === "zone") {
      const name = (choices.zoneName || "").trim();
      const peer = (choices.zonePeer || "").trim();
      if (zoneMode === "host") {
        config["zone-init-allow"] = true;
        // Rejoining your own zone only makes sense once it exists at a known URL.
        if (name && peer) config["zone-allow"] = { [name]: peer };
      } else {
        if (!name || !peer) throw new Error("Zone name and peer are both required to join a zone.");
        config["zone-allow"] = { [name]: peer };
      }
    }

    if (layer === "ouroboros") {
      // andock@1.0 is not in the build; these two pins are the whole mechanism.
      // Execution still needs the app to serve ANDEE_EXECUTION_SOCKET — without
      // it the device loads and answers, but every tool call fails closed on 503.
      Object.assign(trusted, OUROBOROS_TRUSTED);
      nameResolverLists.push(OUROBOROS_NAME_RESOLVERS);
      config["lapee-allow-request-trusted-ca"] = true;
      config["http-client-prefer-ipv4"] = true;
      if (!activeLayers.has("bundler")) config["lapee-profile"] = "ouroboros-tunnel";
    }

    if (layer === "bundler") {
      const beneficiary = (choices.beneficiary || "").trim();
      if (!beneficiary) throw new Error("Bundler beneficiary is required when Bundler is enabled.");
      startHooks.push({ device: P4_BOOTSTRAP_DEVICE });
      Object.assign(trusted, BUNDLER_TRUSTED);
      nameResolverLists.push(BUNDLER_NAME_RESOLVERS);
      Object.assign(config, {
        "lapee-profile": "aopayment-bundler-p4-paid-remote",
        "lapee-allow-request-trusted-ca": true,
        "http-client-prefer-ipv4": true,
        "bundler-beneficiary": beneficiary,
        "bundler-ans104": "https://up.arweave.net:443",
        "bundler-premium": 0,
        "bundler-free-byte-limit": 0,
        "bundler-max-items": clampInt(choices.maxItems, 1, 10000, 1000),
        "bundler-max-bundle-dispatch-delay": 2000,
        "lapee-bundler-completed-item-retention-ms": 0,
        "simple-pay-price": clampInt(choices.price, 0, Number.MAX_SAFE_INTEGER, 0),
        "ao-payment-ledger": "ledger",
        "ao-payment-ledger-path": "/ledger~node-process@1.0",
        "arweave-byte-price": "dynamic",
        "arweave-mempool-copycat-on-bundle-complete": true,
        "arweave-mempool-progress": true,
        // Live but zero-priced, the pattern already shipped for
        // beam-reductions. An absent rate folds to zero anyway; listing the
        // resources makes them discoverable to an operator who wants to
        // charge for the traffic this node carries. Names must be lowercase
        // dash-form: metering@1.0 looks them up verbatim, so "meta_bytes_in"
        // would silently price to zero.
        //
        // These are meta@1.0's meters, not the tunnel's. They count every
        // request the node handles rather than relayed traffic alone, so
        // pricing them here tolls this node's own callers -- which is the
        // point when the node is serving, and a mistake if the intent was to
        // charge only for a tunnel. Directions are from this node's side:
        // meta-bytes-in is what arrives, meta-bytes-out is what it returns.
        "metering-rates": {
          "beam-reductions": 0,
          "meta-bytes-in": 0,
          "meta-bytes-out": 0,
          "meta-request-ms": 0,
        },
        "router-opts": {
          offered: [
            { template: "/.*~process@1.0/.*", price: clampInt(choices.price, 0, Number.MAX_SAFE_INTEGER, 0) },
            { template: "/~bundler@1.0/tx", price: clampInt(choices.price, 0, Number.MAX_SAFE_INTEGER, 0) },
            { template: "/~bundler@1.0/item", price: clampInt(choices.price, 0, Number.MAX_SAFE_INTEGER, 0) },
          ],
        },
      });
    }
  }

  if (choices.disableHyperbuddy) {
    // render-index-page looks like the switch but does not exist in this
    // HyperBEAM. default-index is the key actually read, and it is not reserved.
    config["default-index"] = false;
  }

  if (startHooks.length) {
    config.on = { ...(config.on || {}), start: startHooks };
  }
  if (nameResolverLists.length) {
    config["name-resolvers"] = mergeNameResolvers(nameResolverLists);
  }
  if (Object.keys(trusted).length) {
    config["trusted-devices"] = trusted;
  }

  config["andee-profile-source"] = `andee-configurator/${layers.join("+") || "plain"}`;
  return sortKeys(config);
}

function layersForProfile(profile) {
  if (!profile) return [];
  const layers = [];
  if (profile.scheduler) layers.push("scheduler");
  if (profile.tunnel) layers.push("tunnel");
  if (profile.zone) layers.push("zone");
  if (profile.ouroboros) layers.push("ouroboros");
  if (profile.bundler) layers.push("bundler");
  return layers;
}

function normalizeLayers(layers) {
  const known = new Set(CAPABILITIES.map((capability) => capability.id));
  return [...new Set(layers)].filter((layer) => known.has(layer));
}

/** Keys an operator config cannot set; the node restores its measured values. */
export function strippedKeys(config) {
  return RESERVED_BOOT_KEYS.filter((k) => k in config);
}

/**
 * Fold several resolver lists into one. Device-name pins (`{"andock@1.0": id}`)
 * merge into a single leading map; `{device: ...}` entries and bare strings
 * keep their order and are de-duplicated, so combining profiles cannot emit
 * `arweave@2.9` twice.
 */
function mergeNameResolvers(lists) {
  const pins = {};
  const tail = [];
  const seen = new Set();
  for (const list of lists) {
    for (const entry of list) {
      if (entry && typeof entry === "object" && !("device" in entry)) {
        Object.assign(pins, entry);
        continue;
      }
      const key = JSON.stringify(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      tail.push(entry);
    }
  }
  return Object.keys(pins).length ? [pins, ...tail] : tail;
}

/**
 * A router typed by hand usually arrives as a bare hostname. The connect hook
 * needs an absolute URL: given `tunnel.example.com` the client has no scheme to
 * dial, so it never reaches the router and the node sits on "connecting"
 * forever rather than reporting a bad address. Default to https and drop any
 * trailing slash so the same router is one string however it was entered.
 */
export function normalizePeer(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sortKeys(obj) {
  // `on` and `trusted-devices` last: they are the bulky ones and reading the
  // scalar settings first makes a downloaded config far easier to eyeball.
  const tail = ["name-resolvers", "trusted-devices", "router-opts", "on"];
  const keys = Object.keys(obj).sort((a, b) => {
    const ta = tail.indexOf(a);
    const tb = tail.indexOf(b);
    if (ta !== -1 || tb !== -1) return (ta === -1 ? -1 : ta) - (tb === -1 ? -1 : tb);
    return a.localeCompare(b);
  });
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
