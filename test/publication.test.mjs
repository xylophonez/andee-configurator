import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { ASSETS, buildSite } from "../build.mjs";

test("published HTML starts without fetching its module graph or deployment", async () => {
  const outdir = await mkdtemp(join(tmpdir(), "configurator-publication-"));
  try {
    await buildSite(outdir);
    const html = await readFile(join(outdir, "index.html"), "utf8");
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"/i);
    const embedded = html.match(/<script type="application\/json" id="release-deployment">([\s\S]*?)<\/script>/);
    assert.deepEqual(JSON.parse(embedded[1]), JSON.parse(await readFile(join(outdir, "deployment.json"))));
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 2);
    for (const [, script] of scripts) new Script(script);
    for (const [path] of ASSETS) assert.ok((await stat(join(outdir, path))).size > 0);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
