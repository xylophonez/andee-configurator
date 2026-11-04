import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ASSETS = [
  ["index.html", "text/html"],
  ["styles.css", "text/css"],
  ["src/app.js", "text/javascript"],
  ["src/build-config.js", "text/javascript"],
  ["src/agent-config.js", "text/javascript"],
  ["src/provider-config.js", "text/javascript"],
  ["src/presets.js", "text/javascript"],
  ["src/theme.js", "text/javascript"],
  ["src/andee-phone.js", "text/javascript"],
  ["src/tunnel-discovery.js", "text/javascript"],
  ["deployment.json", "application/json"],
];

const root = dirname(fileURLToPath(import.meta.url));

export async function buildSite(outdir = resolve(root, "dist")) {
  const [template, css, deployment, bundled] = await Promise.all([
    readFile(resolve(root, "index.html"), "utf8"),
    readFile(resolve(root, "styles.css"), "utf8"),
    readFile(resolve(root, "deployment.json"), "utf8"),
    build({
      absWorkingDir: root, entryPoints: ["src/app.js"], bundle: true,
      write: false, format: "iife", platform: "browser", target: "es2022",
      minify: true, legalComments: "none",
    }),
  ]);
  const script = bundled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const release = JSON.stringify(JSON.parse(deployment)).replace(/</g, "\\u003c");
  const stylesheet = '<link rel="stylesheet" href="styles.css?v=20260929-standalone-market" />';
  const entrypoint = '<script type="module" src="src/app.js?v=20260929-standalone-market"></script>';
  if (!template.includes(stylesheet) || !template.includes(entrypoint)) {
    throw new Error("Build entrypoints changed; update the self-contained publication.");
  }
  const html = template
    .replace(stylesheet, () => `<style>${css}</style>`)
    .replace(entrypoint, () => `<script type="application/json" id="release-deployment">${release}</script>\n    <script>${script}</script>`);
  for (const [path] of ASSETS) {
    const destination = resolve(outdir, path);
    await mkdir(dirname(destination), { recursive: true });
    if (path === "index.html") await writeFile(destination, html);
    else await copyFile(resolve(root, path), destination);
  }
  return outdir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built self-contained Configurator: ${await buildSite()}`);
}
