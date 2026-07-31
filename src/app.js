import { buildConfig, profileById, strippedKeys } from "./build-config.js";
import { PROFILES, TUNNEL_IMPL, TUNNEL_PEER, ZONES } from "./presets.js";

const el = (id) => document.getElementById(id);

const state = {
  profile: "tunnel",
};

function boot() {
  renderProfiles();
  el("tunnel-peer").value = TUNNEL_PEER;
  el("tunnel-workers").value = "3";
  el("tunnel-impl").value = TUNNEL_IMPL;
  el("price").value = "0";
  el("max-items").value = "1000";
  renderZoneOptions();
  bindEvents();
  applyProfile();
}

function renderProfiles() {
  const host = el("profiles");
  host.replaceChildren();
  for (const profile of PROFILES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile";
    button.dataset.id = profile.id;
    button.setAttribute("aria-pressed", String(profile.id === state.profile));
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const blurb = document.createElement("span");
    blurb.textContent = profile.blurb;
    button.append(name, blurb);
    button.addEventListener("click", () => {
      state.profile = profile.id;
      for (const other of host.querySelectorAll(".profile")) {
        other.setAttribute("aria-pressed", String(other.dataset.id === profile.id));
      }
      applyProfile();
    });
    host.append(button);
  }
}

function renderZoneOptions() {
  const select = el("zone-select");
  select.replaceChildren();
  for (const zone of ZONES) {
    const option = document.createElement("option");
    option.value = zone.id;
    option.textContent = zone.name;
    select.append(option);
  }
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Other…";
  select.append(custom);
  selectZone(ZONES[0]?.id ?? "custom");
}

function selectZone(id) {
  const select = el("zone-select");
  select.value = id;
  const zone = ZONES.find((z) => z.id === id);
  if (zone) {
    el("zone-name").value = zone.name;
    el("zone-peer").value = zone.peer;
    el("zone-note").textContent = zone.note ?? "";
  } else {
    el("zone-note").textContent = "";
  }
}

function bindEvents() {
  el("zone-select").addEventListener("change", (event) => {
    if (event.target.value !== "custom") selectZone(event.target.value);
    else el("zone-note").textContent = "";
    render();
  });
  for (const id of [
    "tunnel-peer", "tunnel-workers", "tunnel-impl",
    "zone-name", "zone-peer",
    "beneficiary", "price", "max-items", "disable-hyperbuddy",
  ]) {
    el(id).addEventListener("input", render);
  }
  el("download").addEventListener("click", download);
  el("copy").addEventListener("click", copy);
}

function applyProfile() {
  const profile = profileById(state.profile);
  el("tunnel-card").hidden = !profile.tunnel;
  el("zone-card").hidden = !profile.zone;
  el("bundler-card").hidden = !profile.bundler;
  el("zone-hint").textContent = profile.zone === "host"
    ? "This node may create a zone. Others join it by attesting; a zone reachable only on localhost can be joined by nothing, so keep the tunnel on."
    : "Joined on boot. Admission runs a live measurement check, so only nodes with a matching attestation are admitted.";
  render();
}

function currentChoices() {
  return {
    profile: state.profile,
    tunnelPeer: el("tunnel-peer").value,
    tunnelWorkers: el("tunnel-workers").value,
    tunnelImpl: el("tunnel-impl").value,
    zoneName: el("zone-name").value,
    zonePeer: el("zone-peer").value,
    beneficiary: el("beneficiary").value,
    price: el("price").value,
    maxItems: el("max-items").value,
    disableHyperbuddy: el("disable-hyperbuddy").checked,
  };
}

let lastConfigText = "";

function render() {
  const error = el("build-error");
  const beneficiaryError = el("beneficiary-error");
  try {
    const config = buildConfig(currentChoices());
    const stripped = strippedKeys(config);
    if (stripped.length) {
      // Should be impossible; surfaced rather than silently shipped.
      throw new Error(`Config contains reserved keys: ${stripped.join(", ")}`);
    }
    lastConfigText = `${JSON.stringify(config, null, 2)}\n`;
    el("preview").textContent = lastConfigText;
    error.hidden = true;
    beneficiaryError.hidden = true;
    el("download").disabled = false;
    el("copy").disabled = false;
  } catch (exc) {
    lastConfigText = "";
    el("preview").textContent = "";
    const message = exc instanceof Error ? exc.message : String(exc);
    if (message.includes("beneficiary")) {
      beneficiaryError.hidden = false;
      error.hidden = true;
    } else {
      error.textContent = message;
      error.hidden = false;
      beneficiaryError.hidden = true;
    }
    el("download").disabled = true;
    el("copy").disabled = true;
  }
}

function download() {
  if (!lastConfigText) return;
  const blob = new Blob([lastConfigText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "next.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copy() {
  if (!lastConfigText) return;
  try {
    await navigator.clipboard.writeText(lastConfigText);
    const note = el("copy-note");
    note.hidden = false;
    setTimeout(() => { note.hidden = true; }, 1600);
  } catch {
    // Clipboard is unavailable outside a secure context; selecting the preview
    // is the honest fallback rather than pretending the copy worked.
    const range = document.createRange();
    range.selectNodeContents(el("preview"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

boot();
