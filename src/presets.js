// Operator-config building blocks for a PermawebOS node running on Android.
//
// Everything here is an *operator* config: it is imported through the node's
// config picker and merged over the measured base config on the next boot. Keys
// the Android boot-config store reserves (store, match-index, priv-store,
// arweave-index-store, preloaded-store, load-remote-devices, ...) are
// deliberately absent — the store strips them and restores the measured base
// values, so offering them here would only mislead.

// Routers are discovered, not listed. One is hard-coded as a bootstrap so the
// picker is usable before discovery runs, with no network and on a first load.
//
// Deliberately no `note`. A hard-coded sentence about somebody else's tunnel is
// a claim we cannot keep true: it describes behaviour that changes without us
// hearing about it, and it is shown to users as fact. Everything a router says
// about itself -- price, how many nodes trust it, which implementation it pins
// -- is read from the router when it is probed.
//
// A router and the node registering with it must agree on the tunnel@1.0
// implementation, and routers repin independently, so each entry carries its
// own `impl` rather than sharing a global pin. The value below is a starting
// point; probing replaces it with whatever the router currently pins.
export const TUNNELS = [
  {
    id: "smoke",
    name: "smoke.solutions",
    peer: "https://smoke.solutions",
    impl: "SVKRgrshzPceeBdnknJNvR-m2zQ0mFYJvjMx0rSscW0",
  },
];

export const TUNNEL_PEER = TUNNELS[0].peer;

// Implementation the default router currently trusts. If a tunnel refuses
// to register, check this first: the router repins it from time to time and a
// stale value fails before a device is ever contacted.
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

// Live zone, created 2026-07-31, admission gated on AndEE attestation.
export const ZONES = [
  {
    id: "permawebos",
    name: "permawebos",
    peer: "https://qd5thgjy7vkcr6pp2hyvqgardhrc426tjjaobbnetv7ctwrdsqda.smoke.solutions",
    ring: "isUcx_QUq_XY-Wdxk66D6FMgoyANEdsgV2na2VDZuTk",
    note: "Template requires measurement-device: andee@1.0, so only genuine AndEE nodes are admitted.",
  },
];

export const TUNNEL_TRUSTED = { "tunnel@1.0": TUNNEL_IMPL };

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

// Ouroboros Linux execution on the phone. `andock@1.0` is published, so it
// loads from Arweave like any other remote device — it is deliberately NOT in
// the build (`stage-android-devices.sh` stages only devices/common and
// devices/android). The published archive already carries renamed copies of
// lib_ouroboros_execution/_tools/_utils, so there is no cross-repo dependency
// to resolve at config time.
export const ANDOCK_SPEC = "Zi9e9KreDY3o2E4j2jZ8l2MaCq6pi9H1vNWvTJBJv1k";
export const ANDOCK_IMPL = "bEIh5SpEZGgL7QRjV7lxktIjVB8KejkRvtEBu0Fox2Y";

export const OUROBOROS_NAME_RESOLVERS = [
  { "andock@1.0": ANDOCK_SPEC },
  { device: "arweave@2.9" },
  { device: "b32-name@1.0" },
];

export const OUROBOROS_TRUSTED = {
  "andock@1.0": ANDOCK_IMPL,
  [ANDOCK_SPEC]: ANDOCK_IMPL,
};

// Same publisher set as the bundler devices; andock is signed by it too.
export const OUROBOROS_SIGNERS = BUNDLER_SIGNERS;

// Independent configuration layers shown by the configurator. Unlike the
// legacy role presets below, these are deliberately additive: operators can
// enable any combination and control their application order.
export const CAPABILITIES = [
  {
    id: "staked-bundler",
    name: "Staked bundler",
    blurb: "Paid bundling and a public URL. Join a zone on the AO staking page. Recommended.",
    adds: ["tunnel startup and public URL", "paid native v0.11 bundler", "your payout address"],
  },
  {
    id: "tunnel",
    name: "Public access",
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
    blurb: "Accept and settle paid items through ~bundler@1.0.",
    adds: ["on.start: P4 bootstrap", "bundler-* and payment settings", "router-opts and device pins"],
  },
  {
    id: "ouroboros",
    name: "Ouroboros",
    blurb: "Serve Linux execution tools through ~andock@1.0.",
    adds: ["andock@1.0 resolver and trust pins", "Ouroboros execution profile"],
  },
];

export const PROFILES = [
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
    blurb: "Paid-bundler profile behind a tunnel. Accepts items at ~bundler@1.0.",
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
      "Linux execution behind a tunnel. Serves the seven Ouroboros tools at ~andock@1.0. " +
      "Needs an APK whose AndeeExecutionManager is started, or every call fails closed with 503.",
    tunnel: true,
    ouroboros: true,
  },
  {
    id: "ouroboros-bundler",
    name: "Ouroboros and bundler",
    blurb: "Linux execution and the paid bundler, both behind one tunnel.",
    tunnel: true,
    ouroboros: true,
    bundler: true,
  },
];
