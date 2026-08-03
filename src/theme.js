// Use the phone's system appearance, with The Fold's light and dark palettes.

const THEME_COLORS = { light: "#FFFFFF", dark: "#1A1815" };

function resolveSystemTheme(media) {
  return media.matches ? "dark" : "light";
}

function applySystemTheme(media) {
  const resolved = resolveSystemTheme(media);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[resolved];
}

export function initTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  applySystemTheme(media);
  media.addEventListener("change", () => applySystemTheme(media));
}
