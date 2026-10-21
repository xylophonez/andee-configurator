// Deploy the configurator to Arweave as a path-manifest app.
//
// Each file is uploaded as a signed ANS-104 data item through
// bundler.mystical.computer, then an Arweave path manifest is uploaded that maps
// the site's paths onto those item ids. The manifest id is the app URL.
//
// The `bundler-subject: body` header is required: without it the node parses the
// item as the request message itself and the upload 404s through its own device.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as arbundles from 'arbundles';
import { buildConfig } from './src/build-config.js';

const BUNDLER = 'https://bundler.mystical.computer/~bundler@1.0/tx';
const WALLET = process.env.ANDEE_DEPLOY_WALLET;

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
  ['deployment.json', 'application/json'],
];

// Check the complete static publication before signing or sending any item.
const assets = FILES.map(([path, type]) => [path, type, readFileSync(new URL(path, import.meta.url))]);
const deployment = JSON.parse(assets.find(([path]) => path === 'deployment.json')[2]);
if (deployment.mode !== 'production') throw new Error('Public publication requires a verified production deployment; test and unavailable manifests cannot be published.');
for (const endpoint of [deployment.gateway, deployment.tunnel?.peer]) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') ||
      /\.(local|localhost|lan|home|internal|test|invalid|example|arpa)$/.test(url.hostname)) {
    throw new Error('Public deployment endpoints must use public HTTPS DNS names.');
  }
}
if (['zone', 'beneficiary', 'stakingUrl'].some(key => key in deployment)) {
  throw new Error('Zone selection and payout addresses must not be supplied by the deployment.');
}
// A synthetic address validates composition only; it is never published as a payout.
buildConfig({ layers: ['staked-bundler'], deployment, beneficiary: 'a'.repeat(43) });
const receipt = { files: {}, manifestId: null };
const record = () => {
  if (process.env.ANDEE_DEPLOY_RECEIPT) writeFileSync(process.env.ANDEE_DEPLOY_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
};
if (process.env.ANDEE_DEPLOY_DRY_RUN === '1') {
  console.log(`Validated ${assets.length} static assets and public deployment; nothing signed or uploaded.`);
  process.exit(0);
}

if (!WALLET) throw new Error('Set ANDEE_DEPLOY_WALLET to the approved publishing wallet.');
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
for (const [path, contentType, data] of assets) {
  const id = await upload(
    data,
    [
      { name: 'Content-Type', value: contentType },
      { name: 'App-Name', value: 'andee-configurator' },
    ],
    basename(path),
  );
  paths[path] = { id };
  receipt.files[path] = { id, contentType, bytes: data.length };
  record();
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

receipt.manifestId = manifestId;
receipt.url = `https://arweave.net/${manifestId}/`;
record();
console.log(`\napp: https://arweave.net/${manifestId}/`);
