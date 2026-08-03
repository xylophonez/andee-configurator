// The wireframe geometry and 12fps yaw motion come directly from the AndEE
// phone renderer in LapEE's lapee-splash.js. This focused component keeps only
// the phone model so the configurator does not ship the entire boot splash.

const FPS = 12;
const FRAME_MS = 1000 / FPS;
const YAW_PER_FRAME = 0.05;
const TILT = 0.45;

const HTMLElementBase = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

class AndeePhoneElement extends HTMLElementBase {
  static get observedAttributes() {
    return ["status"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; contain: strict; }
      canvas { display: block; width: 100%; height: 100%; }
    `;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute(
      "aria-label",
      this.getAttribute("aria-label") || "Rotating wireframe AndEE phone",
    );
    this.shadowRoot.append(style, this.canvas);
    this.yaw = 0.36;
    this.lastTick = 0;
    this.raf = 0;
  }

  attributeChangedCallback() {
    this.updateAccessibilityLabel();
    if (this.canvas?.width) this.draw();
  }

  connectedCallback() {
    this.updateAccessibilityLabel();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this);
    this.resize();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  updateAccessibilityLabel() {
    if (!this.canvas) return;
    const state = this.getAttribute("status") === "connected" ? "Connected" : "Disconnected";
    this.canvas.setAttribute("aria-label", `${state} rotating wireframe AndEE phone`);
  }

  resize() {
    const rect = this.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.draw();
    }
  }

  tick(now) {
    if (now - this.lastTick >= FRAME_MS) {
      this.yaw += YAW_PER_FRAME;
      this.lastTick = now;
      this.draw();
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  draw() {
    const ctx = this.canvas.getContext("2d");
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(this);
    ctx.strokeStyle = styles.getPropertyValue("--phone-frame").trim() || styles.color;
    ctx.lineWidth = Math.max(0.9, width / 105);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width / 3.6, height / 4.35);
    for (const [start, end] of phoneEdges()) {
      line(
        ctx,
        project(start, this.yaw, centerX, centerY, scale),
        project(end, this.yaw, centerX, centerY, scale),
      );
    }
    for (const [start, end] of phoneFaceLines()) {
      line(
        ctx,
        project(start, this.yaw, centerX, centerY, scale),
        project(end, this.yaw, centerX, centerY, scale),
      );
    }
    const [homeX, homeY] = project([0, -1.5, -0.2], this.yaw, centerX, centerY, scale);
    ctx.beginPath();
    ctx.arc(homeX, homeY, Math.max(1.1, width / 58), 0, Math.PI * 2);
    ctx.stroke();

    drawStatus(
      ctx,
      this.getAttribute("status") === "connected" ? "connected" : "disconnected",
      this.yaw,
      centerX,
      centerY,
      scale,
      width,
      styles,
    );
  }
}

function drawStatus(ctx, status, yaw, centerX, centerY, scale, width, styles) {
  const z = -0.24;
  const orientation = Math.cos(yaw) < 0 ? -1 : 1;
  const faceViewer = (points) => points.map(([x, y, pointZ]) => [x * orientation, y, pointZ]);
  ctx.save();
  ctx.strokeStyle = styles.getPropertyValue(
    status === "connected" ? "--positive" : "--phone-disconnected",
  ).trim();
  ctx.lineWidth = Math.max(1.5, width / 62);

  if (status === "connected") {
    polyline(ctx, faceViewer([
      [-0.48, 0.02, z],
      [-0.12, -0.34, z],
      [0.56, 0.42, z],
    ]), yaw, centerX, centerY, scale);
  } else {
    polyline(ctx, faceViewer([
      [-0.4, 0.38, z],
      [-0.25, 0.62, z],
      [0.12, 0.7, z],
      [0.4, 0.5, z],
      [0.38, 0.2, z],
      [0.1, -0.02, z],
      [0, -0.22, z],
      [0, -0.38, z],
    ]), yaw, centerX, centerY, scale);
    polyline(ctx, faceViewer([
      [0, -0.66, z],
      [0, -0.7, z],
    ]), yaw, centerX, centerY, scale);
  }

  ctx.restore();
}

function phoneEdges() {
  const frontZ = -0.08;
  const backZ = 0.06;
  return [
    ...rectEdges(-1.18, 1.18, -1.86, 1.86, frontZ),
    ...rectEdges(-0.96, 0.96, -1.28, 1.3, frontZ),
    [[-1.18, 1.86, frontZ], [-1.06, 1.76, backZ]],
    [[1.18, 1.86, frontZ], [1.3, 1.76, backZ]],
    [[-1.06, 1.76, backZ], [1.3, 1.76, backZ]],
    [[-1.18, -1.86, frontZ], [-1.06, -1.76, backZ]],
    [[1.18, -1.86, frontZ], [1.3, -1.76, backZ]],
    [[-1.06, -1.76, backZ], [1.3, -1.76, backZ]],
    [[1.3, 1.76, backZ], [1.3, -1.76, backZ]],
  ];
}

function phoneFaceLines() {
  const z = -0.18;
  return [
    [[-0.22, 1.54, z], [0.22, 1.54, z]],
    [[-0.12, -1.5, z], [0.12, -1.5, z]],
  ];
}

function rectEdges(x0, x1, y0, y1, z) {
  return [
    [[x0, y0, z], [x1, y0, z]],
    [[x0, y1, z], [x1, y1, z]],
    [[x0, y0, z], [x0, y1, z]],
    [[x1, y0, z], [x1, y1, z]],
  ];
}

function project(point, yaw, centerX, centerY, scale) {
  const [x, y, z] = rotateY(point, yaw);
  const tiltedY = y * Math.cos(TILT) - z * Math.sin(TILT);
  return [centerX + x * scale, centerY - tiltedY * scale];
}

function rotateY([x, y, z], angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine + z * sine, y, -x * sine + z * cosine];
}

function polyline(ctx, points, yaw, centerX, centerY, scale) {
  const [first, ...rest] = points.map((point) => project(point, yaw, centerX, centerY, scale));
  ctx.beginPath();
  ctx.moveTo(...first);
  for (const point of rest) ctx.lineTo(...point);
  ctx.stroke();
}

function line(ctx, [x1, y1], [x2, y2]) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

if (typeof customElements !== "undefined" && !customElements.get("andee-phone")) {
  customElements.define("andee-phone", AndeePhoneElement);
}
