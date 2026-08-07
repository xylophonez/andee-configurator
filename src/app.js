import { buildConfig, capabilityById, strippedKeys } from "./build-config.js";
import {
  CAPABILITIES,
  TUNNELS,
  TUNNEL_IMPL,
  TUNNEL_PEER,
  ZONES,
} from "./presets.js";
import { initTheme } from "./theme.js";
import { discoverTunnels, probeTunnel, asTunnelEntry, describePrice } from "./tunnel-discovery.js";
import "./andee-phone.js";

const el = (id) => document.getElementById(id);

// What each router said about itself when it was last probed, keyed by peer.
// Built-in entries carry no description of their own, so this is where their
// price and node count come from too -- a bootstrap router is not a router we
// know more about, only one we can reach before discovery has run.
const liveTunnels = new Map();

// Routers found on the network, kept beside the built-in list rather than
// replacing it: discovery needs a gateway and a working connection, and the
// picker has to stay usable without either.
let discoveredTunnels = [];
const allTunnels = () => {
  const builtins = TUNNELS.map((tunnel) => {
    const live = liveTunnels.get(tunnel.peer.replace(/\/+$/, ""));
    // A live pin supersedes the bootstrap value; routers repin without notice.
    return live ? { ...tunnel, impl: live.impl ?? tunnel.impl, note: live.note } : tunnel;
  });
  return [...builtins, ...discoveredTunnels];
};
const findTunnel = (id) => allTunnels().find((tunnel) => tunnel.id === id);
const findTunnelByPeer = (peer) => {
  const wanted = String(peer ?? "").trim().replace(/\/+$/, "");
  return allTunnels().find((tunnel) => tunnel.peer.replace(/\/+$/, "") === wanted);
};

const state = {
  layers: ["tunnel"],
  zoneMode: "join",
  advanced: false,
};

const CAPABILITY_ICONS = {
  tunnel: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19v-7a8 8 0 0 1 16 0v7M8 19v-7a4 4 0 0 1 8 0v7M3 19h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  zone: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13m13-13a9.2 9.2 0 0 1 0 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  bundler: '<svg viewBox="0 0 24 24" fill="none"><path d="m4.5 8 7.5-4 7.5 4v8L12 20l-7.5-4V8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4.8 8.2 7.2 4 7.2-4M12 12.2V20" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  ouroboros: '<svg viewBox="0 0 24 24" fill="none"><path d="M8.3 8.2C5.4 8.2 4 10 4 12s1.4 3.8 4.3 3.8c3.2 0 4.3-7.6 7.4-7.6C18.6 8.2 20 10 20 12s-1.4 3.8-4.3 3.8c-3.1 0-4.2-7.6-7.4-7.6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function capabilityIcon(id) {
  return CAPABILITY_ICONS[id] || CAPABILITY_ICONS.tunnel;
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

let capabilityController = null;
let draggedLayerId = null;

function renderCapabilities() {
  const root = el("capability-picker");
  const trigger = el("capability-trigger");
  const menu = el("capability-menu");
  menu.replaceChildren();

  for (const capability of CAPABILITIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select__option custom-select__option--with-icon";
    button.dataset.value = capability.id;
    button.setAttribute("role", "option");

    const icon = document.createElement("span");
    icon.className = "custom-select__option-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = capabilityIcon(capability.id);

    const copy = document.createElement("span");
    copy.className = "custom-select__option-copy";
    const title = document.createElement("strong");
    title.textContent = capability.name;
    const description = document.createElement("small");
    description.textContent = capability.blurb;
    copy.append(title, description);

    const check = document.createElement("span");
    check.className = "custom-select__check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><path d="m5.5 10 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.append(icon, copy, check);
    menu.append(button);
  }

  capabilityController = {
    close() {
      root.classList.remove("is-open");
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    },
    open() {
      closeCustomSelects(capabilityController);
      root.classList.add("is-open");
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    },
    sync() {
      for (const button of menu.querySelectorAll(".custom-select__option")) {
        button.setAttribute("aria-selected", String(state.layers.includes(button.dataset.value)));
      }
      const selected = state.layers.map((id) => capabilityById(id)).filter(Boolean);
      el("capability-count").textContent = selected.length === 1
        ? "1 capability"
        : `${selected.length} capabilities`;
      el("capability-summary").textContent = selected.length
        ? selected.map((capability) => capability.name).join(" · ")
        : "Local node only";
    },
  };

  trigger.addEventListener("click", () => {
    if (root.classList.contains("is-open")) capabilityController.close();
    else capabilityController.open();
  });
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "Enter", " "].includes(event.key) || root.classList.contains("is-open")) return;
    event.preventDefault();
    capabilityController.open();
  });
  menu.addEventListener("click", (event) => {
    const option = event.target.closest(".custom-select__option");
    if (!option) return;
    const id = option.dataset.value;
    state.layers = state.layers.includes(id)
      ? state.layers.filter((layer) => layer !== id)
      : [...state.layers, id];
    refreshLayerUI();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    capabilityController.close();
    trigger.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) capabilityController.close();
  });

  customSelectControllers.push(capabilityController);
  capabilityController.sync();
  renderLayerStack();
}

function renderLayerStack() {
  const list = el("layer-stack");
  list.replaceChildren();
  el("advanced-toggle").setAttribute("aria-pressed", String(state.advanced));

  if (!state.layers.length) {
    const empty = document.createElement("li");
    empty.className = "layer-stack__empty";
    empty.textContent = "No added layers. This node will run locally with its measured defaults.";
    list.append(empty);
    return;
  }

  state.layers.forEach((id, index) => {
    const capability = capabilityById(id);
    if (!capability) return;
    const item = document.createElement("li");
    item.className = "layer-item";
    item.dataset.layer = id;
    item.draggable = true;

    const grip = document.createElement("span");
    grip.className = "layer-item__grip";
    grip.setAttribute("aria-hidden", "true");
    grip.textContent = "⠿";

    const icon = document.createElement("span");
    icon.className = "layer-item__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = capabilityIcon(id);

    const copy = document.createElement("span");
    copy.className = "layer-item__copy";
    const title = document.createElement("strong");
    title.textContent = capability.name;
    const position = document.createElement("small");
    position.textContent = `Layer ${index + 1}`;
    copy.append(title, position);

    const controls = document.createElement("span");
    controls.className = "layer-item__controls";
    controls.append(
      layerActionButton("up", `Move ${capability.name} up`, "↑", index === 0),
      layerActionButton("down", `Move ${capability.name} down`, "↓", index === state.layers.length - 1),
      layerActionButton("remove", `Remove ${capability.name}`, "×"),
    );

    item.append(grip, icon, copy, controls);
    if (state.advanced) {
      const details = document.createElement("span");
      details.className = "layer-item__details";
      const label = document.createElement("small");
      label.textContent = "Adds to next.json";
      const code = document.createElement("code");
      code.textContent = capability.adds.join("\n");
      details.append(label, code);
      item.append(details);
    }
    list.append(item);
  });
}

function layerActionButton(action, label, text, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.layerAction = action;
  button.setAttribute("aria-label", label);
  button.textContent = text;
  button.disabled = disabled;
  return button;
}

function refreshLayerUI() {
  capabilityController?.sync();
  renderLayerStack();
  applyLayers();
}

function moveLayer(id, offset) {
  const from = state.layers.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= state.layers.length) return;
  const layers = [...state.layers];
  [layers[from], layers[to]] = [layers[to], layers[from]];
  state.layers = layers;
  refreshLayerUI();
}

function moveLayerAround(sourceId, targetId, after = false) {
  if (!sourceId || sourceId === targetId) return;
  const layers = state.layers.filter((id) => id !== sourceId);
  const target = layers.indexOf(targetId);
  if (target < 0) return;
  layers.splice(target + (after ? 1 : 0), 0, sourceId);
  state.layers = layers;
  refreshLayerUI();
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
  renderCapabilities();
  el("tunnel-peer").value = TUNNEL_PEER;
  el("tunnel-workers").value = "3";
  el("tunnel-impl").value = TUNNEL_IMPL;
  el("price").value = "0";
  el("max-items").value = "1000";
  renderTunnelOptions();
  renderZoneOptions();
  bindEvents();
  if (bridge) {
    el("apply").hidden = false;
    el("download").classList.remove("button--primary");
    el("download").classList.add("button--secondary");
  }
  renderNodeIdentity();
  applyLayers();
  // Discover in the background. The picker is already usable at this point --
  // the bootstrap router is rendered and selected -- so this only ever adds to
  // it. Failure is silent by design: a page that cannot reach a gateway should
  // still configure a node against the router it already has.
  runTunnelDiscovery({ quiet: true });
  refreshSelectedTunnel();
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

function renderTunnelOptions() {
  const select = el("tunnel-select");
  select.replaceChildren();
  for (const tunnel of allTunnels()) {
    const option = document.createElement("option");
    option.value = tunnel.id;
    option.textContent = tunnel.name;
    select.append(option);
  }
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Other…";
  select.append(custom);
  selectTunnel(TUNNELS[0]?.id ?? "custom");
  setupCustomSelect({
    rootId: "tunnel-picker",
    selectId: "tunnel-select",
    triggerId: "tunnel-trigger",
    menuId: "tunnel-menu",
    // Only the manual option gets fixed prose. A router describes itself once
    // it has been probed, and says nothing until then rather than inheriting a
    // sentence that was written about a different router.
    describe: (id) =>
      id === "custom" ? "Enter another router manually." : (findTunnel(id)?.note ?? ""),
    onSync: (option) => { el("tunnel-selected-label").textContent = option?.textContent ?? "Other…"; },
  });
}

function selectTunnel(id) {
  const select = el("tunnel-select");
  select.value = id;
  const tunnel = findTunnel(id);
  if (tunnel) {
    el("tunnel-peer").value = tunnel.peer;
    // Each router pins its own implementation; carrying the previous router's
    // pin over is the commonest reason a node is refused registration.
    el("tunnel-impl").value = tunnel.impl;
    el("tunnel-note").textContent = tunnel.note ?? "";
  } else {
    el("tunnel-note").textContent = "";
  }
}

/** Keep the picker truthful when the URL is edited by hand: typing a known
 *  router's address selects it, anything else falls back to "Other…". */
function syncTunnelPickerFromPeer() {
  const select = el("tunnel-select");
  const match = findTunnelByPeer(el("tunnel-peer").value);
  const wanted = match?.id ?? "custom";
  if (select.value === wanted) return;
  select.value = wanted;
  el("tunnel-selected-label").textContent = match?.name ?? "Other…";
  el("tunnel-note").textContent = match?.note ?? "";
  for (const button of el("tunnel-menu").querySelectorAll(".custom-select__option")) {
    button.setAttribute("aria-selected", String(button.dataset.value === wanted));
  }
}

/** Ask the selected router what it currently pins and charges.
 *
 *  The pin matters more than the price. A router repins on its own schedule,
 *  so any value written down here goes stale silently and the node is refused
 *  registration before a device is ever contacted. Reading it from the router
 *  cannot be stale. Left alone if the probe fails -- an unreachable router is
 *  no reason to discard a pin the user may have typed deliberately. */
async function refreshSelectedTunnel() {
  const peer = el("tunnel-peer").value.trim();
  if (!/^https?:\/\//i.test(peer)) return;
  const note = el("tunnel-discover-note");
  const probe = await probeTunnel(peer, { timeoutMs: 8000 });
  if (!probe) return;
  if (probe.impl && probe.impl !== el("tunnel-impl").value) {
    el("tunnel-impl").value = probe.impl;
    render();
  }
  note.textContent =
    `Live: ${describePrice(probe)}, ${probe.registrations} node` +
    `${probe.registrations === 1 ? "" : "s"} connected.`;
  note.hidden = false;
}

async function runTunnelDiscovery({ quiet = false } = {}) {
  const button = el("tunnel-discover");
  const note = el("tunnel-discover-note");
  button.disabled = true;
  button.textContent = "Searching…";
  if (!quiet) {
    note.hidden = false;
    note.textContent = "Reading location records…";
  }
  try {
    const { candidates, tunnels } = await discoverTunnels({ timeoutMs: 8000 });
    // A built-in router that also turns up in discovery is enriched, not
    // duplicated: its live price and pin land in `liveTunnels` and it keeps its
    // own entry in the list.
    const known = new Set(TUNNELS.map((tunnel) => tunnel.peer.replace(/\/+$/, "")));
    for (const tunnel of tunnels) liveTunnels.set(tunnel.peer, asTunnelEntry(tunnel));
    discoveredTunnels = tunnels
      .filter((tunnel) => !known.has(tunnel.peer))
      .map(asTunnelEntry);
    const current = el("tunnel-select").value;
    renderTunnelOptions();
    if (findTunnel(current)) el("tunnel-select").value = current;
    // On the background pass say nothing unless something was found -- an
    // empty registry is the normal state today and is not news on page load.
    if (!quiet || discoveredTunnels.length) {
      note.hidden = false;
      note.textContent = discoveredTunnels.length
        ? `Found ${discoveredTunnels.length} router${discoveredTunnels.length === 1 ? "" : "s"} ` +
          `from ${candidates} location record${candidates === 1 ? "" : "s"}.`
        : `No new routers among ${candidates} location records. ` +
          `A node only becomes findable once it publishes one.`;
    }
  } catch (exc) {
    if (!quiet) note.textContent = `Could not search: ${exc?.message ?? exc}`;
  } finally {
    button.disabled = false;
    button.textContent = "Find routers";
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
  for (const button of document.querySelectorAll("[data-zone-mode]")) {
    button.addEventListener("click", () => {
      state.zoneMode = button.dataset.zoneMode;
      for (const modeButton of document.querySelectorAll("[data-zone-mode]")) {
        modeButton.setAttribute("aria-pressed", String(modeButton === button));
      }
      applyLayers();
    });
  }
  el("advanced-toggle").addEventListener("click", () => {
    state.advanced = !state.advanced;
    renderLayerStack();
  });
  el("layer-stack").addEventListener("click", (event) => {
    const action = event.target.closest("[data-layer-action]");
    const item = action?.closest("[data-layer]");
    if (!action || !item) return;
    if (action.dataset.layerAction === "remove") {
      state.layers = state.layers.filter((id) => id !== item.dataset.layer);
      refreshLayerUI();
    } else {
      moveLayer(item.dataset.layer, action.dataset.layerAction === "up" ? -1 : 1);
    }
  });
  el("layer-stack").addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-layer]");
    if (!item) return;
    draggedLayerId = item.dataset.layer;
    item.classList.add("is-dragging");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  el("layer-stack").addEventListener("dragend", (event) => {
    event.target.closest("[data-layer]")?.classList.remove("is-dragging");
    draggedLayerId = null;
  });
  el("layer-stack").addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-layer]")) return;
    event.preventDefault();
  });
  el("layer-stack").addEventListener("drop", (event) => {
    const target = event.target.closest("[data-layer]");
    if (!target) return;
    event.preventDefault();
    const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    moveLayerAround(draggedLayerId, target.dataset.layer, after);
    draggedLayerId = null;
  });
  el("tunnel-select").addEventListener("change", (event) => {
    if (event.target.value !== "custom") selectTunnel(event.target.value);
    else el("tunnel-note").textContent = "";
    render();
    refreshSelectedTunnel();
  });
  el("tunnel-discover").addEventListener("click", runTunnelDiscovery);
  // A hand-typed router gets the same treatment once the field settles.
  el("tunnel-peer").addEventListener("change", () => refreshSelectedTunnel());
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
      if (event.target.id === "tunnel-peer") syncTunnelPickerFromPeer();
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

function applyLayers() {
  const active = new Set(state.layers);
  el("tunnel-card").hidden = !active.has("tunnel");
  el("zone-card").hidden = !active.has("zone");
  el("bundler-card").hidden = !active.has("bundler");
  el("zone-hint").textContent = state.zoneMode === "host"
    ? "This node may create a zone. Others join it by attesting; a zone reachable only on localhost can be joined by nothing, so keep the tunnel on."
    : "Joined on boot. Admission runs a live measurement check, so only nodes with a matching attestation are admitted.";
  render();
}

function currentChoices() {
  return {
    layers: [...state.layers],
    zoneMode: state.zoneMode,
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
