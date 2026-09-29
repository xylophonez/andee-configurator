// Deploy the configurator to Arweave as a path-manifest app.
//
// Each file is uploaded as a signed ANS-104 data item through
// bundler.mystical.computer, then an Arweave path manifest is uploaded that maps
// the site's paths onto those item ids. The manifest id is the app URL.
//
// The `bundler-subject: body` header is required: without it the node parses the
// item as the request message itself and the upload 404s through its own device.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as arbundles from 'arbundles';

const BUNDLER = 'https://bundler.mystical.computer/~bundler@1.0/tx';
const WALLET = process.env.ANDEE_DEPLOY_WALLET
  ?? '/home/fn/Dev/reference-owner/wallet.json';

// Paths are relative to the repo root and become the manifest's paths.
// Every module app.js pulls in must be here: a manifest missing one entry
// leaves the page loading a module graph that cannot resolve, which fails
// silently as a blank configurator rather than a 404 anyone would notice.
const FILES = [
  ['index.html', 'text/html'],
  ['styles.css', 'text/css'],
  ['src/app.js', 'text/javascript'],
  ['src/build-config.js', 'text/javascript'],
  ['src/presets.js', 'text/javascript'],
  ['src/theme.js', 'text/javascript'],
  ['src/andee-phone.js', 'text/javascript'],
  ['src/tunnel-discovery.js', 'text/javascript'],
  ['downloads/tunnel-provider-pack.zip', 'application/zip'],
];

// The archive is generated from the reviewed docs and checker on every deploy.
execFileSync('python3', [fileURLToPath(new URL('./scripts/package-tunnel-provider.py', import.meta.url))], {
  stdio: 'inherit',
});

const jwk = JSON.parse(readFileSync(WALLET, 'utf8'));
const signer = new arbundles.ArweaveSigner(jwk);

async function upload(data, tags, label) {
  const item = arbundles.createData(data, signer, { tags });
  await item.sign(signer);
  const res = await fetch(BUNDLER, {
    method: 'POST',
    headers: {
      'content-type': 'application/ans104',
      'bundler-subject': 'body',
      accept: 'application/json',
    },
    body: item.getRaw(),
  });
  if (!res.ok) {
    throw new Error(`${label}: upload failed ${res.status} ${await res.text()}`);
  }
  const remote = res.headers.get('id');
  if (remote && remote !== item.id) {
    throw new Error(`${label}: id mismatch, local ${item.id} vs remote ${remote}`);
  }
  console.log(`  ${label.padEnd(22)} ${item.id}  ${item.getRaw().length} bytes`);
  return item.id;
}

console.log('uploading files');
const paths = {};
for (const [path, contentType] of FILES) {
  const id = await upload(
    readFileSync(new URL(path, import.meta.url)),
    [
      { name: 'Content-Type', value: contentType },
      { name: 'App-Name', value: 'andee-configurator' },
    ],
    basename(path),
  );
  paths[path] = { id };
}

const manifest = {
  manifest: 'arweave/paths',
  version: '0.2.0',
  index: { path: 'index.html' },
  // Anything unresolved falls back to the app shell rather than 404ing.
  fallback: { id: paths['index.html'].id },
  paths,
};

console.log('uploading manifest');
const manifestId = await upload(
  JSON.stringify(manifest),
  [
    { name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
    { name: 'App-Name', value: 'andee-configurator' },
    { name: 'Title', value: 'PermawebOS Node Configurator' },
  ],
  'manifest',
);

console.log(`\napp: https://arweave.net/${manifestId}/`);
