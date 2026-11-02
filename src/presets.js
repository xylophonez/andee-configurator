// Operator-config building blocks for a PermawebOS node running on Android.
//
// Everything here is an *operator* config: it is imported through the node's
// config picker and merged over the measured base config on the next boot. Keys
// the Android boot-config store reserves (store, match-index, priv-store,
// arweave-index-store, preloaded-store, load-remote-devices, ...) are
// deliberately absent — the store strips them and restores the measured base
// values, so offering them here would only mislead.

// Known routers bootstrap the picker before discovery runs, with no network
// and on a first load. Discovery can add other providers.
//
// Deliberately no `note`. A hard-coded sentence about somebody else's tunnel is
// a claim we cannot keep true: it describes behaviour that changes without us
// hearing about it, and it is shown to users as fact. Everything a router says
// about itself -- price, how many nodes trust it, which implementation it pins
// -- is read from the router when it is probed.
//
// The measured platform preload supplies tunnel@1.0. Providers do not
// choose the implementation installed on the phone. Explicit operator pins
// remain available through the advanced field.
export const TUNNELS = [
  {
    id: "iloveao",
    name: "iloveao.online",
    peer: "https://iloveao.online",
    impl: "",
  },
  {
    id: "mystical",
    name: "tunnel.mystical.computer",
    peer: "https://tunnel.mystical.computer",
    impl: "",
  },
  {
    id: "smoke",
    name: "smoke.solutions",
    peer: "https://smoke.solutions",
    impl: "",
  },
];

export const TUNNEL_PEER = TUNNELS[0].peer;

// Empty selects the implementation supplied by the measured platform preload.
export const TUNNEL_IMPL = TUNNELS[0].impl;

export function tunnelById(id) {
  return TUNNELS.find((tunnel) => tunnel.id === id);
}

/** The known router serving `peer`, if any — used to keep the picker honest
 *  when someone types or pastes a URL directly. */
export function tunnelByPeer(peer) {
  const wanted = String(peer ?? "").trim().replace(/\/+$/, "");
  return TUNNELS.find((tunnel) => tunnel.peer.replace(/\/+$/, "") === wanted);
}

// No AndEE-admitting public zone has been verified for this RC4 composition.
// Zone selection for staked bundlers belongs to the staking flow.
export const ZONES = [];

export const TUNNEL_TRUSTED = {};

// Remote payment and pricing devices composed with the native v0.11 bundler.
// The lapee-p4-bootstrap start hook creates its ledger and P4 processors.
export const BUNDLER_NAME_RESOLVERS = [
  {
    "ao-payment@1.0": "B0tLXS0jzRtLkn-3DGhSmuGZwrEQH0-Jxg5-UFUVh1s",
    "arweave-byte-pricing@1.0": "LMByssb9jjrc2DUQOucor4t0Zni0JOViiY6PZmGgHRU",
    "bundler-settlement@1.0": "Nu-wM8Pdq4r6MTOKYFXnM6Jn0vAeGI732l-TsOcmazY",
    "lapee-bundler-gc@1.0": "obuc_4WtzF1vHZT17s3iV07O-qzgQuSAfmjECpehcYQ",
    "lapee-p4-bootstrap@1.0": "xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q",
    "pricing-router@1.0": "UH8LNK2WMtgVBhQ6YCkk5dPyKbp3hHsb9pWCznVfYNA",
    "simple-oracle@1.0": "SGIOFvYoRKYIj3bC9_3Ggv2n0lNCOoSRrWJyHUrKeKg",
  },
  { device: "arweave@2.9" },
  { device: "b32-name@1.0" },
  "G_gb7SAgogHMtmqycwaHaC6uC-CZ3akACdFv5PUaEE8~json@1.0/deserialize&target=data",
];

export const BUNDLER_TRUSTED = {
  "ao-payment@1.0": "1ibPlucxI642_p1V1ICOpEq2horsV6_bs153M5AZ-Hk",
  "B0tLXS0jzRtLkn-3DGhSmuGZwrEQH0-Jxg5-UFUVh1s": "1ibPlucxI642_p1V1ICOpEq2horsV6_bs153M5AZ-Hk",
  "arweave-byte-pricing@1.0": "XE8fg4poXwCYdMJm4uDFhlC3RQ7FuOKDtb8gSxbakm0",
  "LMByssb9jjrc2DUQOucor4t0Zni0JOViiY6PZmGgHRU": "XE8fg4poXwCYdMJm4uDFhlC3RQ7FuOKDtb8gSxbakm0",
  "bundler-settlement@1.0": "oeJGtUCutNdfszNuwGs0r7VW_inRhuFl_nDYraIRWjk",
  "Nu-wM8Pdq4r6MTOKYFXnM6Jn0vAeGI732l-TsOcmazY": "oeJGtUCutNdfszNuwGs0r7VW_inRhuFl_nDYraIRWjk",
  "lapee-bundler-gc@1.0": "AKXhtDqE_U7L275NMuZAqLvJm6rREgHajkfez1ugLTk",
  "obuc_4WtzF1vHZT17s3iV07O-qzgQuSAfmjECpehcYQ": "AKXhtDqE_U7L275NMuZAqLvJm6rREgHajkfez1ugLTk",
  "lapee-p4-bootstrap@1.0": "mR2aqX5udR7HiOexS3KDbURu59q7sjcJdYOXrxZkk0I",
  "xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q": "mR2aqX5udR7HiOexS3KDbURu59q7sjcJdYOXrxZkk0I",
  "pricing-router@1.0": "e1T6L5u7dgj6nMkj3z7pUQjBrMWQdahm5xy5PV5tXOg",
  "UH8LNK2WMtgVBhQ6YCkk5dPyKbp3hHsb9pWCznVfYNA": "e1T6L5u7dgj6nMkj3z7pUQjBrMWQdahm5xy5PV5tXOg",
  "simple-oracle@1.0": "cEwxPCEk3WIYbWmeXOKlYsvLLBUKeB44P5F2y2FftaI",
  "SGIOFvYoRKYIj3bC9_3Ggv2n0lNCOoSRrWJyHUrKeKg": "cEwxPCEk3WIYbWmeXOKlYsvLLBUKeB44P5F2y2FftaI",
};

export const BUNDLER_SIGNERS = [
  "q5Fcm0NJ34-ss3E1R9dgjGKLLA0B-KYw0J_6U-Pck6o",
  "aYDOU6kEcE3lK7aA-gTmUKHTbLlQnZZXWpv1_i_Uq1U",
  "vZY2XY1RD9HIfWi8ift-1_DnHLDadZMWrufSh-_rKF0",
];

export const P4_BOOTSTRAP_DEVICE = "xC0kc--Ata4MPzJDyKqLSfWGal5OC2NiAtw0y9ZNf7Q";

// AndEE RC8 already supplies andock@1.0. Application device pins come from
// the same reviewed deployment manifest as the paid-bundler package set.
export const AGENT_DEVICES = [
  "agent@1.0", "inference@1.0", "intelligence-pool@1.0",
  "ouroboros@1.0", "ouroboros-space@1.0", "weavemail@1.0",
];

// Independent configuration layers shown by the configurator. Unlike the
// legacy role presets below, these are deliberately additive: operators can
// enable any combination and control their application order.
export const CAPABILITIES = [
  {
    id: "full",
    name: "Full",
    blurb: "Your agent, free AI, optional ChatGPT connection, public URL and bundler, configured together.",
    adds: ["Your agent and AI connections", "a tunnel", "bundling"],
  },
  {
    id: "staked-bundler",
    name: "Tunnelled bundler",
    blurb: "Bundling and a public URL.",
    adds: ["tunnel startup and public URL", "native v0.11 bundler", "your payout address"],
  },
  {
    id: "tunnel",
    name: "Tunnel configuration",
    blurb: "Give the node a public URL through a tunnel.",
    adds: ["on.start: tunnel connect", "trusted-devices: tunnel@1.0"],
  },
  {
    id: "zone",
    name: "Zone",
    blurb: "Join an attested zone or host one for other nodes.",
    adds: ["zone-allow or zone-init-allow"],
  },
  {
    id: "bundler",
    name: "Bundler",
    blurb: "Accept and settle items through ~bundler@1.0.",
    adds: ["on.start: P4 bootstrap", "bundler-* and payment settings", "router-opts and device pins"],
  },
  {
    id: "ouroboros",
    name: "Ouroboros",
    blurb: "Run your agent with free AI, optional ChatGPT and the tools built into your node.",
    adds: ["Ouroboros, agent, inference and messaging devices", "ChatGPT connection and your wallet binding"],
  },
];

export const PROFILES = [
  {
    id: "full",
    name: "Full",
    blurb: "Your agent, AI connections, a tunnel and bundling.",
    full: true,
  },
  {
    id: "plain",
    name: "Plain node",
    blurb: "Runs locally. No tunnel, no zone, not reachable from outside.",
  },
  {
    id: "tunnel",
    name: "Tunnelled node",
    blurb: "Reachable on a public URL through a tunnel.",
    tunnel: true,
  },
  {
    id: "zone-member",
    name: "Zone member",
    blurb: "Tunnelled, and joins a zone on boot. Admission is attested.",
    tunnel: true,
    zone: "join",
  },
  {
    id: "zone-host",
    name: "Zone host",
    blurb: "Tunnelled, and may create a zone others attest into.",
    tunnel: true,
    zone: "host",
  },
  {
    id: "bundler",
    name: "Bundler",
    blurb: "Bundler profile behind a tunnel. Accepts items at ~bundler@1.0.",
    tunnel: true,
    bundler: true,
  },
  {
    id: "bundler-zone",
    name: "Bundler in a zone",
    blurb: "Everything: bundler, tunnel, and zone membership.",
    tunnel: true,
    bundler: true,
    zone: "join",
  },
  {
    id: "ouroboros",
    name: "Ouroboros node",
    blurb:
      "Your agent and ChatGPT connection behind a public URL.",
    tunnel: true,
    ouroboros: true,
  },
  {
    id: "ouroboros-bundler",
    name: "Ouroboros and bundler",
    blurb: "Linux execution and the bundler, both behind one tunnel.",
    tunnel: true,
    ouroboros: true,
    bundler: true,
  },
];
