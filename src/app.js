import { buildConfig, profileById, strippedKeys } from "./build-config.js";
import { PROFILES, TUNNEL_IMPL, TUNNEL_PEER, ZONES } from "./presets.js";
import { initTheme } from "./theme.js";
import "./andee-phone.js";

const el = (id) => document.getElementById(id);

const state = {
  profile: "tunnel",
};

const PROFILE_ICONS = {
  plain: '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M10 6h4m-3 12h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tunnel: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19v-7a8 8 0 0 1 16 0v7M8 19v-7a4 4 0 0 1 8 0v7M3 19h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "zone-member": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="5" cy="6" r="2" stroke="currentColor" stroke-width="1.6"/><circle cx="19" cy="6" r="2" stroke="currentColor" stroke-width="1.6"/><path d="m6.5 7.5 3.7 3.7m7.3-3.7-3.7 3.7M12 15.5V20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  "zone-host": '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13m13-13a9.2 9.2 0 0 1 0 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  bundler: '<svg viewBox="0 0 24 24" fill="none"><path d="m4.5 8 7.5-4 7.5 4v8L12 20l-7.5-4V8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4.8 8.2 7.2 4 7.2-4M12 12.2V20" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  "bundler-zone": '<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6"/><circle cx="4" cy="5" r="1.5" fill="currentColor"/><circle cx="20" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="21" r="1.5" fill="currentColor"/><path d="m5.2 6 3.2 3.2M18.8 6l-3.2 3.2M12 16v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  ouroboros: '<svg viewBox="0 0 24 24" fill="none"><path d="M8.3 8.2C5.4 8.2 4 10 4 12s1.4 3.8 4.3 3.8c3.2 0 4.3-7.6 7.4-7.6C18.6 8.2 20 10 20 12s-1.4 3.8-4.3 3.8c-3.1 0-4.2-7.6-7.4-7.6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "ouroboros-bundler": '<svg viewBox="0 0 24 24" fill="none"><path d="M7.3 7.8C4.8 7.8 3.5 9.5 3.5 11.3s1.3 3.5 3.8 3.5c2.8 0 3.7-7 6.5-7 2.5 0 3.7 1.7 3.7 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m14.5 15.5 3-1.6 3 1.6v3.2l-3 1.6-3-1.6v-3.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

function profileIcon(id) {
  return PROFILE_ICONS[id] || PROFILE_ICONS.plain;
}

const customSelectControllers = [];

function closeCustomSelects(except = null) {
  for (const controller of customSelectControllers) {
    if (controller !== except) controller.close();
  }
}

function setupCustomSelect({ rootId, selectId, triggerId, menuId, describe, icon, onSync }) {
  const root = el(rootId);
  const select = el(selectId);
  const trigger = el(triggerId);
  const menu = el(menuId);
  menu.replaceChildren();

  for (const option of select.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select__option";
    button.dataset.value = option.value;
    button.setAttribute("role", "option");

    const iconMarkup = icon?.(option.value);
    if (iconMarkup) {
      const optionIcon = document.createElement("span");
      optionIcon.className = "custom-select__option-icon";
      optionIcon.setAttribute("aria-hidden", "true");
      optionIcon.innerHTML = iconMarkup;
      button.classList.add("custom-select__option--with-icon");
      button.append(optionIcon);
    }

    const copy = document.createElement("span");
    copy.className = "custom-select__option-copy";
    const title = document.createElement("strong");
    title.textContent = option.textContent;
    copy.append(title);

    const description = describe?.(option.value);
    if (description) {
      const small = document.createElement("small");
      small.textContent = description;
      copy.append(small);
    }

    const check = document.createElement("span");
    check.className = "custom-select__check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><path d="m5.5 10 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.append(copy, check);
    menu.append(button);
  }

  const controller = {
    close() {
      root.classList.remove("is-open");
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    },
    open() {
      closeCustomSelects(controller);
      root.classList.add("is-open");
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menu.scrollTop = 0;
    },
    sync() {
      for (const button of menu.querySelectorAll(".custom-select__option")) {
        button.setAttribute("aria-selected", String(button.dataset.value === select.value));
      }
      onSync?.(select.selectedOptions[0]);
    },
  };

  trigger.addEventListener("click", () => {
    if (root.classList.contains("is-open")) controller.close();
    else controller.open();
  });

  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "Enter", " "].includes(event.key) && !root.classList.contains("is-open")) {
      event.preventDefault();
      controller.open();
    }
  });

  menu.addEventListener("click", (event) => {
    const optionButton = event.target.closest(".custom-select__option");
    if (!optionButton) return;
    select.value = optionButton.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    controller.sync();
    controller.close();
    trigger.focus();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !root.classList.contains("is-open")) return;
    event.preventDefault();
    controller.close();
    trigger.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) controller.close();
  });

  customSelectControllers.push(controller);
  controller.sync();
  return controller;
}

// Inside the AndEE in-app browser the page can hand the config straight to the
// node instead of making the operator download and re-pick a file.
const bridge = typeof window !== "undefined" && window.AndeeBridge?.isAndee?.()
  ? window.AndeeBridge
  : null;

function parseNodeInfo(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shortAddress(value) {
  const address = String(value || "").trim();
  if (address.length <= 16) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

// The shipped Android bridge currently exposes only isAndee() and
// stageNextBootConfig(). This also supports the richer getNodeInfo() contract
// when the app adds it, without inventing device information in browser preview.
function renderNodeIdentity() {
  document.querySelector("andee-phone")?.setAttribute("status", bridge ? "connected" : "disconnected");

  if (!bridge) {
    el("node-title").textContent = "No AndEE connected";
    el("node-detail").textContent = "Open this page inside AndEE to read and apply node settings.";
    return;
  }

  let info = null;
  try {
    info = parseNodeInfo(bridge.getNodeInfo?.());
  } catch {
    // An older bridge is still a real AndEE connection; it just cannot expose
    // node metadata yet.
  }

  if (!info) {
    el("node-title").textContent = "AndEE connected";
    el("node-detail").textContent = "Configuration can be applied directly to this node.";
    return;
  }

  const deviceName = info.deviceName || info.model || info.name || "This AndEE";
  const address = info.nodeAddress || info.address;
  const version = info.hyperbeamVersion || info.version;
  const details = [shortAddress(address), version && `HyperBEAM ${version}`].filter(Boolean);
  el("node-title").textContent = deviceName;
  el("node-detail").textContent = details.join(" · ") || "Connected to the local HyperBEAM node.";
}

function boot() {
  renderProfiles();
  el("tunnel-peer").value = TUNNEL_PEER;
  el("tunnel-workers").value = "3";
  el("tunnel-impl").value = TUNNEL_IMPL;
  el("price").value = "0";
  el("max-items").value = "1000";
  renderZoneOptions();
  bindEvents();
  if (bridge) {
    el("apply").hidden = false;
    el("download").classList.remove("button--primary");
    el("download").classList.add("button--secondary");
  }
  renderNodeIdentity();
  applyProfile();
}

function applyToNode() {
  if (!bridge || !lastConfigText) return;
  const note = el("apply-note");
  try {
    const result = bridge.stageNextBootConfig(lastConfigText);
    if (result === "staged") {
      note.textContent = "Staged. Restart the node to apply.";
    } else {
      note.textContent = String(result);
    }
  } catch (exc) {
    note.textContent = `Could not apply: ${exc?.message ?? exc}`;
  }
  note.hidden = false;
}

function renderProfiles() {
  const select = el("profile-select");
  select.replaceChildren();
  for (const profile of PROFILES) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    select.append(option);
  }
  select.value = state.profile;
  select.addEventListener("change", () => {
    state.profile = select.value;
    applyProfile();
  });
  setupCustomSelect({
    rootId: "profile-picker",
    selectId: "profile-select",
    triggerId: "profile-trigger",
    menuId: "profile-menu",
    describe: (id) => profileById(id).blurb,
    icon: profileIcon,
    onSync: (option) => {
      el("profile-icon").innerHTML = profileIcon(option?.value);
    },
  });
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
  setupCustomSelect({
    rootId: "zone-picker",
    selectId: "zone-select",
    triggerId: "zone-trigger",
    menuId: "zone-menu",
    describe: (id) => ZONES.find((zone) => zone.id === id)?.note ?? "Enter another zone manually.",
    onSync: (option) => { el("zone-selected-label").textContent = option?.textContent ?? "Other…"; },
  });
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

function syncNumberStepper(input) {
  const stepper = input.closest(".number-stepper");
  if (!stepper || input.value === "") return;
  const value = Number(input.value);
  const decrease = stepper.querySelector('[data-step-direction="down"]');
  const increase = stepper.querySelector('[data-step-direction="up"]');
  decrease.disabled = input.min !== "" && value <= Number(input.min);
  increase.disabled = input.max !== "" && value >= Number(input.max);
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
    el(id).addEventListener("input", (event) => {
      syncNumberStepper(event.target);
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-step-target]")) {
    button.addEventListener("click", () => {
      const input = el(button.dataset.stepTarget);
      if (button.dataset.stepDirection === "up") input.stepUp();
      else input.stepDown();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const input of document.querySelectorAll(".number-stepper input")) {
    syncNumberStepper(input);
  }
  el("download").addEventListener("click", download);
  el("copy-inline").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copy();
  });
  el("preview").addEventListener("click", copy);
  el("preview").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    copy();
  });
  el("apply").addEventListener("click", applyToNode);
}

function applyProfile() {
  const profile = profileById(state.profile);
  el("profile-name").textContent = profile.name;
  el("profile-blurb").textContent = profile.blurb;
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
    el("copy-inline").disabled = false;
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
    el("copy-inline").disabled = true;
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
    const inlineButton = el("copy-inline");
    inlineButton.classList.add("is-copied");
    inlineButton.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      inlineButton.classList.remove("is-copied");
      inlineButton.setAttribute("aria-label", "Copy generated configuration");
    }, 1600);
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

initTheme();
boot();
