# Full Configurator — published release and phone handoff

The user requested the complete device set and required fields in Configurator,
clear opening instructions, and installation on their ADB-connected phone for
human testing. They explicitly approved “Publish the prepared release” after
being told that publication signs the nine device packages and Configurator
assets through the existing Arweave workflow. No Git push, account funding,
transfer, stake, real ChatGPT login or paid inference was performed.

## Delivered behavior

Full is first and selected by default. Its three-step guide explains where to
copy the extension's public wallet address, how to apply and restart AndEE, and
how to continue with ChatGPT in the extension. That address is the required
input; Full binds both the Ouroboros operator and Pool subscription owner to it.
No callback URL or API key is required. Bundler payout defaults to the same
wallet and can be overridden. Staking is optional for ChatGPT connection.
Apply stays disabled until required fields are valid. The phone is left on the
published Configurator with the wallet field blank for the user's test.

## Release identity

- Configurator implementation: `d29e36d` (guidance), `6cafaa0` (published pins),
  on `feat/full-andee-profile-20261028`.
- AndEE implementation: `6a1968f`, on `fix/andee-open-node-root-20261028`.
- Public page: <https://arweave.net/Pa3OuFqmwvueGE0ROLMofBVeCQX4NOseP1CMLKLn9qs/>.
- Release signer: `y7iivTAENPj0fq-PJmIgnG8GY7ubDAqoVQwEfJM1TU8`.
- Publication: nine device packages (18 signed spec/implementation messages),
  eleven static assets, and their Arweave path manifest, through the existing
  `bundler.mystical.computer/~bundler@1.0/tx` endpoint.
- APK SHA-256: `ce497b37fa135d7df4a85ce08d7267e98ac81419d5ed1f0325464e2370c0a551`.
- Installed package: `org.permaweb.andee`, version `0.1.0` / code `1`.
- APK signing certificate SHA-256:
  `585ee0f27a1aa12f5354f4907f56ba0b77130509279b600dc26c73f60277acfc`.

Archive payloads are byte-identical to the locally tested review packages; only
their canonical release signatures and associated spec references changed.
`deployment.json` is the authoritative mapping of device names to published
specification and implementation IDs. The APK contains no application devices;
the configuration resolves those packages through the existing device mechanism.

## Validation and limits

- All 69 Configurator tests pass. All 37 Android unit tests, release lint,
  assembly and generic APK verification pass.
- All 18 device messages and eleven site assets were read back from the public
  Arweave gateway and their payloads verified. The manifest root serves the
  expected HTML. Browser rendering and required-wallet validation passed.
- Actual API-35 emulator GUI: published Configure → enter disposable public
  wallet → Apply to AndEE → Apply & close → reopen. No ADB reverse or local
  preview server was available for this production run.
- After that boot, the public device pins and dedicated owners match the Full
  configuration. Ouroboros reports healthy. Pool's signed challenge/session,
  OpenAI subscription protocol, agent grants, owner-scoped account access,
  unsigned-access rejection (401), and logout pass.
- Normal APK update installed on Pixel 9 `4C250DLAQ004WN`. A read-back of the
  installed APK matches the SHA-256 above. Public metadata before and after
  confirms the same node identity, operator configuration hash, configuration
  source and owner settings. Configure opens the new published page on the
  physical phone. No private app store mutation or configuration apply was used
  on that phone; the user will apply their own wallet and Full configuration.
- Native/runtime payload comparison: 75 entries byte-identical to the earlier
  root-link APK. The release changes the Configurator pin, not node runtime code.
- Live ChatGPT authorization and an actual conversation remain the human test.
  Passing protocol checks does not establish live OAuth, inference or funded
  bundler settlement.

## Device-model review at delivery

Composition: **Splash 2 +identity; ladder (a); full adherence.** Scope agreed.
Precedents: `src/build-config.js:254` composes the existing paid profile;
`src/agent-config.js:5` composes the personal-agent/Pool ownership contract.
Owners: ouroboros@1.0, agent@1.0, inference@1.0, intelligence-pool@1.0,
ouroboros-space@1.0, weavemail@1.0, native andock@1.0, p4@1.0,
ao-payment@1.11, arweave-byte-pricing@1.11, lapee-p4-bootstrap@1.12,
tunnel@1.0 and zone@1.0. Duplication none. Explicit implementation/signature pins
account for the identity modifier. No device or kernel implementation edits.

UI guidance: **Splash 4 +unconditional; ladder (b); partial adherence.** Scope
agreed. Precedents: the same existing configuration builders above and
`arch/android/android/app/src/main/java/org/permaweb/andee/ConfiguratorActivity.kt:68`
in the AndEE worktree (existing JavaScript bridge; staging at line 70).
Owners are Configurator presentation and `AndeeBootConfigStore`, which retains
the next-boot configuration lifecycle. Duplication none. This exceeds strict
rung-(b) pure data exposure because opening instructions and validation
presentation change user-visible behavior. Independent review is still required;
the user has requested the installed build for human testing. The publishing
approval is not recorded as completion of that review. Ratings are unchanged
from the proposal.

## Evidence

Public receipts, test logs and screenshots: `build/full-release/` in this
Configurator worktree. Native build, APK verification, and phone metadata:
`arch/android/build/full-release/` in the AndEE worktree. A curated, public-only
handoff is staged at `/home/fn/Downloads/AndEE-Full-20261028/`.
No private signing key, session token or provider credential is part of the
handoff. Git commits remain local.
