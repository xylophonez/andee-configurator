# Full profile and restored Configurator — local review

Historical local-review record. Publication was subsequently authorized and the
standalone app installed: [published release evidence](full-release-20261028.md).
The publication boundary below describes the earlier review build.

Request: restore Configure in AndEE, put Full first with the complete agent and
staked-bundler composition, and accept pasted node links regardless of their path.

## Device-model review

Composition: **Splash 2 +identity; ladder (a); full adherence.** Scope agreed.
Precedents: `src/build-config.js:254` composes the existing paid profile, and
`/home/fn/agent-work/intelligence-pool-andee-chatgpt-20261027/docs/device.md:318`
specifies the existing personal Pool contract. Owners are ouroboros@1.0,
agent@1.0, inference@1.0, intelligence-pool@1.0, ouroboros-space@1.0,
weavemail@1.0, native andock@1.0, lapee-p4-bootstrap@1.12, p4@1.0,
ao-payment@1.11, arweave-byte-pricing@1.11, tunnel@1.0 and zone@1.0.
Duplication none; no device/backend/kernel edits in this change.
The identity modifier covers explicit trusted implementation/name pins.

UI/navigation: **Splash 4 +unconditional; ladder (b); partial adherence.**
Scope agreed. Precedent: native commit `b1b9b23`,
`arch/android/android/app/src/main/java/org/permaweb/andee/ConfiguratorActivity.kt:87`
(the same staging bridge); current `AndeeBootConfigStore.kt:15` owns pending
configuration. Extension precedent: `core/api/nodeConnection/nodeConnectionAdapter.ts:49`
and `platforms/web/common/api/qrScanner/index.ts:61`, both consuming shared URL
normalization. Owners: Android presentation, next-boot store, existing Configurator
and shared URL parser. Duplication none. Restoring UI, selecting Full by default,
and accepting arbitrary link paths change behavior and therefore exceed strict
rung-(b) pure exposure. The build-time review URL is also new build configuration.
The requested UI changes do not add a parallel runtime mechanism. Independent
review remains required by `/home/fn/AGENTS.md`; this agent cannot approve itself.
Ratings are unchanged from the proposal.

## Tested behavior

- Configurator: 69 tests pass and syntax checks pass. Full first/default; invalid
  owner, incomplete deployment and mixed complete presets fail closed. Payout
  override does not change agent ownership. API keys remain private; preview and
  clipboard redact them. Bundler has no GC dependency or automatic zone selection.
- Actual browser: Full first/default; required owner validation; optional API key
  fields and preview redaction. Optional settings collapse; layer-order controls
  disappear for complete presets. Interface toggle now matches its visible label.
- Android: 37 unit tests and lint pass; release assembly and generic APK verifier
  pass. All 79 native/runtime entries match the previous root-link APK.
- Actual API-35 emulator GUI: Configure → Full → public wallet address → Apply to
  AndEE → Apply & Close → reopen. Full boots from that saved configuration.
- Live emulator: payment ledger created, fixed node identity retained, payout and
  dedicated Pool/agent owners correct. Ouroboros model discovery responds. Pool
  signed challenge/session, OpenAI SIWC protocol, agent grants, owner-scoped account
  access, unauthorized rejection (401) and logout pass with a disposable wallet.
- P4 intentionally retains its existing node-wallet operator while the dedicated
  Ouroboros and Pool owner fields remain the user's extension wallet. The explicit
  owner fields are verified after boot; JSON alone would not establish this.
- No real ChatGPT login, paid inference, upload, stake or payment was performed.
  This proves composition boot and management access, not funded settlement or
  successful live OAuth. Existing synthetic inference proofs predate this change.
- Shared onboarding UI accepted a URL with arbitrary path, ~meta, query and
  fragment; its node confirmation displays only http://127.0.0.1:58776 and the
  correct emulator node identity. Actual installed-extension service-worker
  behavior remains outside this browser test.

## Publication boundary

The emulator review APK compiles http://127.0.0.1:5497/ as its Configurator URL
and needs an ADB reverse while reviewing. It is not a standalone production APK.
The production default still references the previous public Arweave Configurator.
Do not deliver the loopback review build as a production update.

The checked-in deployment remains unavailable with empty new pins. Local review
packages were built with the stock RC8 packager and cached through the node's
signed public cache-write endpoint. No private Android store injection occurred.
Test signing keys are not release authority and are excluded from delivery.

Release requires approved publication of six agent packages plus compatible
payment, pricing and GC-free bootstrap (nine device packages), verification of
retrievability, production deployment pins, then the eleven static Configurator
assets and their path manifest. Finally compile the new manifest URL into the
APK and install a normal signed update. This does not require a Git push.
Retain the user's phone identity/configuration and let the user apply Full with
their extension wallet; no wallet address is prefilled by the deployment.

Existing payment reservation policy remains the predecessor's setting; this
change does not assert new pricing/funding approval or valid zone admission.

## Source/package evidence

- Pool: 1db05a2ea1a5c860f8d59775bbe69267a68eab06
- Ouroboros: 0eb8f6a111c64031e34b5899152539d62e86b116
- Payment: c649256b94400afc975c5461eed87eb3445e5ea0
- Pricing: af1d53d2684df40df8379bd51799ecfadf6847a9
- GC-free bootstrap: ca35e275016520d2133e6b136d85f0bf55396479

Detailed local receipts: `build/full-review/` (package pins, archive checksums,
public cache-write results, signed-session probe, test logs and screenshots).
No private key, session token or credential belongs in the review artifact.
