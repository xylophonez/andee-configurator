import { AGENT_DEVICES } from "../../src/presets.js";
export const owner = "c".repeat(43);
export const deployment = {
  version: 1, mode: "lab",
  tunnel: { peer: "https://tunnel.example" },
  gateway: "http://127.0.0.1:36245",
  agent: { devices: Object.fromEntries(AGENT_DEVICES.map((name, i) => [name, {
    spec: String(i + 1).repeat(43), implementation: String(i + 2).repeat(43),
  }])) },
  payments: { reservationAmount: 10000000000, signers: [owner], devices: Object.fromEntries([
    "ao-payment@1.11", "arweave-byte-pricing@1.11", "lapee-p4-bootstrap@1.12",
    "pricing-router@1.0", "simple-oracle@1.0",
  ].map((name, i) => [name, { spec: String(i + 3).repeat(43), implementation: String(i + 4).repeat(43) }])) },
};
