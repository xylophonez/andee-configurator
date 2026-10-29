// Turn the form's choices into the operator config the node will import.
//
// Kept free of DOM access so it can be unit-tested directly under node.

import {
  BUNDLER_NAME_RESOLVERS,
  BUNDLER_SIGNERS,
  BUNDLER_TRUSTED,
  CAPABILITIES,
  P4_BOOTSTRAP_DEVICE,
  PROFILES,
  TUNNEL_TRUSTED,
} from "./presets.js";
import { agentConfig } from "./agent-config.js";

export const RESERVED_BOOT_KEYS = [
  "access-remote-cache-for-client",
  "arweave-index-store",
  "cache-control",
  "forge-bootstrap",
  "http-extra-opts",
  "load-remote-devices",
  "loaded-device-store",
  "match-index",
  "measurement-body-source",
  "preloaded-devices-index",
  "preloaded-store",
  "priv-store",
  "store",
  "store-defaults",
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
 * @param {number} [choices.maxItems]
 * @param {boolean} [choices.disableHyperbuddy]
 */
export function buildConfig(choices) {
  if (choices.layers?.includes("full") || choices.profile === "full") {
    if (choices.layers?.some((layer) => layer !== "full")) {
      throw new Error("Full already includes the agent, tunnel and staked bundler. Select it on its own.");
    }
    agentConfig(choices);
    const beneficiary = String(choices.beneficiary || "").trim() || choices.agentOwner;
    const paid = buildStakedBundler({ ...choices, beneficiary });
    const full = withAgent(paid, choices);
    return sortKeys(withPackageIndex({
      ...full,
      "andee-profile-source": "andee-configurator/full",
      // The owner and beneficiary bundle for free; other signers keep byte pricing
      // (lapee-p4-bootstrap@1.13).
      "faff-allow-list": [...new Set([full.operator, full["bundler-beneficiary"]])],
    }, choices.deployment));
  }
  if (choices.layers?.includes("staked-bundler") || choices.profile === "staked-bundler") {
    if (choices.layers?.some((layer) => layer !== "staked-bundler")) {
      throw new Error("Staked bundler already includes its required capabilities. Select it on its own.");
    }
    return sortKeys(withPackageIndex(buildStakedBundler(choices), choices.deployment));
  }
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

  for (const layer of layers) {
    if (layer === "tunnel") {
      const peer = normalizePeer(choices.tunnelPeer);
      if (!peer) throw new Error("Tunnel provider URL is required when the tunnel is enabled.");
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
        "trusted-device-signers": BUNDLER_SIGNERS,
        "bundler-beneficiary": beneficiary,
        "bundler-ans104": "https://up.arweave.net:443",
        "bundler-premium": 0,
        "bundler-free-byte-limit": 0,
        "bundler-max-items": clampInt(choices.maxItems, 1, 10000, 1000),
        "bundler-max-bundle-dispatch-delay": 2000,
        "lapee-bundler-completed-item-retention-ms": 900000,
        // P4 routes bundler uploads to live Arweave-byte quotes in AO base
        // units. Keep the legacy simple-pay default from the paid profile.
        "simple-pay-price": 0,
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
            { template: "/.*~process@1.0/.*", price: 0 },
            { template: "/~bundler@1.0/tx", price: 0 },
            { template: "/~bundler@1.0/item", price: 0 },
          ],
        },
      });
      config.on = { ...(config.on || {}), request: [{ device: "manifest@1.0" }] };
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
  return sortKeys(withPackageIndex(activeLayers.has("ouroboros") ? withAgent(config, choices) : config, choices.deployment));
}

/** Index only the selected release blocks through the node's existing verified Arweave store. */
function withPackageIndex(config, deployment) {
  if (!deployment?.packageBlocks) return config;
  const pins = new Set([
    ...Object.values(config["trusted-devices"] || {}),
    ...(config["name-resolvers"] || []).flatMap((entry) =>
      entry && typeof entry === "object" && !entry.device ? Object.values(entry) : []),
  ]);
  const blocks = [...new Set([...pins].filter((pin) => pin in deployment.packageBlocks)
    .map((pin) => deployment.packageBlocks[pin]))].sort((a, b) => b - a);
  if (blocks.some((block) => !Number.isSafeInteger(block) || block < 0)) {
    throw new Error("Package confirmation blocks are invalid in this release.");
  }
  if (!blocks.length) return config;
  const hooks = blocks.map((block) => ({
    device: "apply@1.0",
    path: "pair",
    base: "base:package-base",
    request: "base:package-request",
    "package-base": { device: "copycat@1.0" },
    "package-request": { path: "arweave", mode: "shallow", from: block, to: block, reindex: false },
    hook: { result: "ignore" },
  }));
  return { ...config, on: { ...config.on, start: [...hooks, ...(config.on?.start || [])] } };
}

function withAgent(config, choices) {
  const agent = agentConfig(choices);
  return {
    ...config,
    ...agent,
    "trusted-devices": { ...config["trusted-devices"], ...agent["trusted-devices"] },
    "name-resolvers": mergeNameResolvers([config["name-resolvers"] || [], agent["name-resolvers"]]),
  };
}

/** Compose paid bundling; ao-site selects and joins the zone during staking. */
function buildStakedBundler(choices) {
  const d = choices.deployment;
  if (!d || d.version !== 1) throw new Error("Staked bundler deployment is not available yet. Download is disabled until it is configured.");
  // Live upload testing is explicit; the zone's production policy is separate.
  if (d.mode === "unavailable") throw new Error("Staked bundler release is awaiting verified device packages and tunnel settings. Download is disabled.");
  if (!["lab", "live-test", "production"].includes(d.mode)) throw new Error("Unknown deployment mode.");
  const origin = (value, label, httpsOnly = false) => {
    try {
      const url = new URL(value);
      if (!(httpsOnly ? ["https:"] : ["https:", "http:"]).includes(url.protocol) ||
          url.username || url.password || url.search || url.hash ||
          !["", "/"].includes(url.pathname)) throw new Error();
      return url.origin;
    } catch { throw new Error(`${label} must be a valid ${httpsOnly ? "HTTPS" : "HTTP(S)"} origin.`); }
  };
  const id = (value, label) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value ?? "")) throw new Error(`${label} is missing or invalid.`);
    return value;
  };
  const peer = origin(normalizePeer(choices.tunnelPeer ?? d.tunnel?.peer), "Tunnel", true);
  const host = new URL(peer).hostname;
  if (host.length > 200 || /^\d+(\.\d+){3}$/.test(host) || !host.split(".").every((label) =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    throw new Error("Tunnel must have a DNS hostname that supports node subdomains.");
  }
  if (d.mode === "production") {
    for (const [value, label] of [[peer, "Tunnel"], [d.gateway, "Upload gateway"]]) {
      const url = new URL(origin(value, label, true));
      if (!url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":") ||
          /\.(local|localhost|lan|home|internal|test|invalid|example|arpa)$/.test(url.hostname)) {
        throw new Error(`${label} must use a public HTTPS DNS name in production.`);
      }
    }
  }
  const gateway = origin(d.gateway, "Upload gateway", d.mode !== "lab");
  const gatewayHost = new URL(gateway).hostname;
  const octets = gatewayHost.split(".").map(Number);
  const privateIPv4 = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  if (d.mode === "lab" && !privateIPv4 && gatewayHost !== "localhost" && gatewayHost !== "[::1]") {
    throw new Error("Lab upload gateway must be a private or loopback mock origin; public L1 uploads are disabled.");
  }
  // Reuse the paid-bundler composition. Payouts need a durable beneficiary;
  // silently defaulting to an ephemeral node wallet strands operator revenue.
  const paid = buildConfig({
    layers: ["bundler"],
    beneficiary: id((choices.beneficiary || "").trim(), "Bundler beneficiary"),
    maxItems: choices.maxItems,
  });
  // The staked profile composes payments without the legacy GC dependency.
  for (const name of Object.keys(paid["name-resolvers"][0])) {
    if (!name.startsWith("lapee-bundler-gc@")) continue;
    delete paid["trusted-devices"][paid["name-resolvers"][0][name]];
    delete paid["trusted-devices"][name];
    delete paid["name-resolvers"][0][name];
  }
  delete paid["lapee-bundler-completed-item-retention-ms"];
  if (!d.payments) throw new Error("Reviewed payment deployment is required.");
  if (d.payments) {
    if (!Number.isSafeInteger(d.payments.reservationAmount) || d.payments.reservationAmount <= 0) {
      throw new Error("Payment reservation amount must be a positive integer in atomic AO units.");
    }
    paid["ao-payment-reservation-amount"] = d.payments.reservationAmount;
    if (!Array.isArray(d.payments.signers) || d.payments.signers.length === 0) {
      throw new Error("Payment package signers must be configured.");
    }
    paid["trusted-device-signers"] = d.payments.signers.map((signer) => id(signer, "Payment package signer"));
    for (const name of ["ao-payment@1.11", "arweave-byte-pricing@1.11",
      "lapee-p4-bootstrap@1.13",
      "pricing-router@1.1", "simple-oracle@1.0"]) {
      const pin = d.payments.devices?.[name];
      const spec = id(pin?.spec, `${name} specification`);
      const impl = id(pin?.implementation, `${name} implementation`);
      const alias = ({ "ao-payment@1.11": "ao-payment@1.0",
        "arweave-byte-pricing@1.11": "arweave-byte-pricing@1.0",
        "lapee-p4-bootstrap@1.13": "lapee-p4-bootstrap@1.0",
        "pricing-router@1.1": "pricing-router@1.0" })[name] ?? name;
      delete paid["trusted-devices"][paid["name-resolvers"][0][alias]];
      paid["name-resolvers"][0][alias] = spec;
      paid["name-resolvers"][0][name] = spec;
      Object.assign(paid["trusted-devices"], { [alias]: impl, [name]: impl, [spec]: impl });
    }
    paid.on.start[0].device = paid["name-resolvers"][0]["lapee-p4-bootstrap@1.0"];
  }
  delete paid.on.request;
  // The bootstrap owns the ledger, request/response processors and payout.
  // Inherit HyperBEAM's request hooks; do not copy or replace them here.
  const config = {
    ...paid,
    "andee-profile-source": "andee-configurator/staked-bundler",
    "allow-rejected-peer-attestation": false,
    gateway,
    on: { ...paid.on, start: [
      ...paid.on.start,
      { device: "tunnel@1.0", path: "connect", method: "POST", peer, workers: clampInt(choices.tunnelWorkers, 1, 32, 8), hook: { result: "ignore" } },
    ] },
  };
  if (choices.tunnelImpl && choices.tunnelImpl.trim()) {
    config["trusted-devices"]["tunnel@1.0"] = choices.tunnelImpl.trim();
  }
  // Fixture routing is explicit. Public compositions inherit RC4's routes.
  if (d.mode === "lab") {
    const opts = { "http-client": "httpc", protocol: "http2", "ao-types": 'atom=("http-client" "protocol")' };
    config.routes = [
      { template: "^/arweave", node: { match: "^/arweave", with: gateway, opts } },
      { template: "/graphql", node: { prefix: gateway, opts } },
    ];
  }
  if (choices.disableHyperbuddy) config["default-index"] = false;
  return sortKeys(config);
}

function layersForProfile(profile) {
  if (!profile) return [];
  const layers = [];
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
