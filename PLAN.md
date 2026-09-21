# Tractate project plan

## Implementation status — main editor v0.1

The Astro/Preact app is implemented with Source, Output, and Both views, a recursive first-row application menu, a resizable desktop split, stacked mobile panes, system themes, and bundled fonts. CodeMirror provides source editing; a worker compiles the documented MDX subset, and an isolated iframe renders the output. The app includes a sample contract, new/import/export actions, local draft persistence, error recovery, and a production offline cache. Output fields are editable and synchronize to MDX, autosave, and export. The interface uses the viewport for editing, opens in Both view, and reads contracts from `contracts/<type>/*.mdx`; static assets belong in `public/assets/`. The editor uses neutral grey themes, menu-only commands, and one compact status row. Contract-defined Menu/MenuItem and Tabs/Tab components are implemented, with a demo under `contracts/demos/`.

A GitHub Pages workflow deploys main to https://kuip.github.io/tractate/ after compiler/browser checks and remote template verification. Shared packages contain approved pinned GitHub references, field values, and signatures; they never embed source. contracts/approved.json governs approved revisions. Native Ed25519 wallets, signature verification, portable Share/QR packages, and the signature-gated Kayros registration adapter are implemented. Server data-type provisioning, live registration validation, and contract execution remain outstanding. See SIGNING.md for the signing format.

The milestones below retain their original acceptance criteria. Implemented editor features do not resolve the remaining protocol and contract-model decisions.

## Starting point

Tractate is an editor/consumer application for crypto contracts on Kayros, a lightchain. At initial inspection, the project had documentation only and was not yet a Git repository. The main editor implementation now provides the foundation described in the status above.

This plan follows the README, the clarified crypto-contract scope and three-view application model, and a read-only inspection of the adjacent Kayros project:

- [Kayros repository](https://github.com/ctzurcanu/kayros)
- Local checkout: `../kayros/`
- Referenced generated protocol bindings: `../kayros/internal/proto/`
- Protocol source inspected: `../kayros/lightnet/proto/lightnet.proto`

Kayros defines hash submission, record lookup, and Merkle-proof operations, among other services. These are potential integration points, not evidence that Tractate contracts already have a defined format or execution model. Verify the HTTP handlers and active protocol version before implementing the integration; the Kayros README alone is not an API compatibility guarantee.

## Required product behavior

- Use Astro, Preact, and MDX.
- Publish applications as static sites on GitHub Pages.
- Allow previously loaded applications to work locally from cache.
- Follow the operating system's light/dark preference.
- Use Roboto Condensed for interface and document text, and Roboto Mono for code and other monospaced content.
- Support mobile layouts.
- Provide one main editor/consumer application with three switchable views, like the model described for HackMD: **Source** (source only), **Output** (rendered output only), and **Both** (source and output together).
- In Both view on wider screens, show MDX source on the left and rendered output on the right with a vertical divider.
- Use Output view to consume the contract and expose its supported interactions.
- Provide an “infinite-level menu” in the first row of the main application, backed by a recursive navigation tree with no fixed nesting depth.

## Decisions to settle first

1. **Crypto-contract model:** The domain is confirmed: crypto contracts on the Kayros lightchain. Define one representative contract, its lifecycle, authorization rules, execution/validation location, and expected lightchain interactions. Specify how MDX presents the contract and how its source relates to executable or verifiable contract data.
2. **Application navigation:** The menu belongs to the main editor/consumer application. Define its initial commands and nesting behavior, including access to Source, Output, and Both views. Keep navigation separate from contract source syntax.
3. **Offline scope:** Provisional target: reopening the hosted app after an initial online visit, editing drafts, and rendering previews without a network connection. Opening a downloaded HTML file directly is a separate requirement and needs separate validation.
4. **MDX trust model:** Decide which components and expressions authors may use. Recommend a restricted, documented MDX subset for the first release; arbitrary JavaScript and external imports should not be enabled implicitly.
5. **Kayros access:** Identify the deployed endpoint, browser authentication, CORS policy, and first supported operation. Define the contract-to-protocol mapping, including serialization, hashing, and versioning.
6. **Application boundaries:** Start with the combined editor/consumer as the first app. Share layout and styles so additional contract apps can be added without prematurely introducing a multi-package workspace.

## Recommended architecture

- **Astro:** Static page shell, routes, metadata, and shared layout.
- **Preact:** Interactive editor/consumer workspace, Source/Output/Both view state, navigation, draft state, and status indicators. All three views share the same contract state.
- **MDX preview pipeline:** Compile edited source in the browser using a deliberately selected runtime pipeline. Build-time MDX support alone does not provide live editing. Validate Preact compatibility in an early spike.
- **Preview isolation:** Render document content in a sandboxed frame with a narrow message interface. Restrict network access and imports, keep credentials and draft storage out of the preview, and verify the restrictions against malicious examples. A compilation worker improves responsiveness but is not a security boundary.
- **Persistence:** Store drafts in IndexedDB; reserve local storage for small preferences. Provide import/export so browser storage is not the only copy of a contract.
- **Offline delivery:** Cache the application shell, editor/compiler assets, fonts, and required examples through a versioned service worker. Keep draft data separate from disposable caches.
- **Contract interactions:** Route supported actions from the rendered output through a validated host interface to the Kayros adapter. Define authorization and signing requirements from Kayros semantics; rendering or switching views must not submit lightchain operations.
- **Kayros adapter:** Isolate browser-facing API calls and protocol conversions behind a small typed interface. Prefer verified existing HTTP endpoints; do not assume generated Go gRPC bindings can be consumed directly by the browser.

Suggested structure, to adjust once the first implementation spike is complete:

```text
src/
  pages/index.astro
  layouts/AppLayout.astro
  components/editor/
  components/navigation/
  components/preview/
  lib/contracts/
  lib/kayros/
  lib/storage/
  styles/
public/
  fonts/
  examples/
tests/
```

## Implementation sequence

### Phase 1 — Define the first contract and prove the preview

- [ ] Specify the first crypto-contract lifecycle and its Kayros operations, recording decisions alongside the project documentation.
- [ ] Define the application menu commands and Source/Output/Both behavior.
- [ ] Create a representative crypto contract with MDX presentation and the permitted components needed to consume it.
- [ ] Prototype browser-side MDX compilation and rendering with Preact.
- [ ] Establish the supported syntax, component allowlist, and preview isolation rules.
- [ ] Verify malformed source produces an actionable error without crashing the editor.

**Done when:** A source edit updates the preview, invalid input is recoverable, and the supported document model is explicit.

### Phase 2 — Scaffold the static application

- [ ] Initialize Git and scaffold Astro with Preact, MDX support, and TypeScript.
- [ ] Commit a dependency lockfile and define development, build, and validation scripts.
- [ ] Add a shared layout with system-driven light/dark themes.
- [ ] Bundle the required font files and their licenses for offline use.
- [ ] Configure asset URLs and routing for GitHub Pages project subpaths.

**Done when:** A production build serves correctly beneath the intended Pages base path with both themes and the required fonts.

### Phase 3 — Build the editor/consumer and navigation

- [ ] Implement explicit Source, Output, and Both view controls.
- [ ] Implement a resizable left-source/right-output workspace for Both view on wider screens.
- [ ] Keep all three views available on mobile; recommend vertically stacked panes in Both view on narrow screens.
- [ ] Preserve source, cursor position, output interaction state, and relevant scroll positions when switching views; open in Both view on reload so output is immediately visible.
- [ ] Make Output a usable contract-consumption view with the supported contract interactions and their status. Clearly distinguish local preview state from confirmed lightchain state.
- [ ] Add syntax highlighting, keyboard editing, compilation status, and error locations where available.
- [ ] Debounce compilation and discard stale results so rapid edits cannot overwrite the latest preview.
- [ ] Implement the agreed recursive menu with stable item IDs and keyboard, pointer, and touch navigation.
- [ ] Handle deep menus with scrolling or drill-down navigation instead of off-screen cascading panels.
- [ ] Add accessible labels, visible focus, adequate contrast, and keyboard control for the divider.

**Done when:** A user can switch among Source, Output, and Both on desktop and mobile without losing state, edit and consume a representative contract, navigate with a keyboard, and recover from preview errors without losing source.

### Phase 4 — Preserve drafts and support offline use

- [ ] Autosave drafts with visible saving/saved/error states and restore them after reload.
- [ ] Support new documents and MDX import/export; warn before replacing unsaved content.
- [ ] Version stored document records and provide migrations when their shape changes.
- [ ] Cache all assets needed for offline editing and preview, including dynamically loaded compiler assets.
- [ ] Add offline and update-available states; apply app updates without discarding drafts.
- [ ] Handle unavailable storage, quota errors, and multiple tabs without silently overwriting drafts.

**Done when:** After one successful online load, the app reopens offline, restores a draft, renders edits, and exports the result. Cache updates do not erase drafts.

### Phase 5 — Integrate one Kayros workflow

- [ ] Inspect the actual Kayros HTTP handlers and implement the operations required by the first crypto-contract lifecycle. Hash registration and record lookup may support this workflow, but do not by themselves establish contract execution or validation semantics.
- [ ] Document the contract schema and the exact bytes used for any digest, including encoding, normalization, algorithm, and schema version.
- [ ] Confirm how document fields map to protocol fields. The inspected hash request uses 32-byte `data_type` and `data_item` fields; document content cannot simply be passed into them unchanged.
- [ ] Build the typed adapter with input validation, actionable errors, and configurable endpoint selection.
- [ ] Keep privileged keys out of the static bundle and preview. Define credential handling based on the actual deployment model.
- [ ] Show connection and submission state separately from local draft state.
- [ ] Keep offline submissions explicit for the first release. Add automatic retry only after duplicate-handling and idempotency semantics are established.
- [ ] Validate an end-to-end flow against a development Kayros instance and preserve representative request/response fixtures.

**Done when:** One documented contract workflow works against Kayros, has verified protocol mappings, and fails gracefully when the service is unavailable.

### Phase 6 — Validate and publish

- [ ] Add focused unit tests for document serialization, menu tree behavior, storage migrations, and Kayros field conversions as those features are implemented.
- [ ] Add browser checks for all three views, state retention across view switches, contract consumption, editing, error recovery, import/export, draft restoration, offline reload, preview isolation, and mobile navigation.
- [ ] Check keyboard access, system theme changes, long documents, and deeply nested menus.
- [x] Create a GitHub Pages deployment workflow that runs validation and a production build before publishing.
- [ ] Smoke-test the published project URL, asset paths, refresh behavior, and service-worker scope.
- [ ] Update the README with setup, supported MDX syntax, deployment steps, offline limitations, and Kayros configuration.

**Done when:** The deployed app passes the critical editing and offline flows, and another developer can build and run it from the documentation.

## Scope and recommendations

Deliver the local editor/consumer with Source, Output, and Both views, reliable rendering, recursive menu, persistence, and offline behavior first. Treat the Kayros adapter as a separate milestone so backend availability does not block document authoring. The first complete integrated release should add only one validated Kayros workflow.

Determine signing, identity, execution, and validation requirements as part of the first crypto-contract workflow; include whatever that workflow requires. Defer collaboration, template marketplaces, and automatic background submission until the core contract lifecycle works.

Prioritize the browser MDX spike and preview trust model before polishing the interface: they determine which documents can be supported safely and whether offline preview is practical. Measure compiler load time and typing responsiveness on a representative mobile device before adding more editor features.

Use a versioned contract format from the first saved document. If contracts will be hashed, preserve original source and define canonicalization explicitly so formatting changes and rendered output do not accidentally change the meaning of verification.

Treat cached application assets and saved user documents as different kinds of data. Provide export early, and describe offline support as available after an initial load, subject to browser storage availability and eviction.

Before selecting additional dependencies, check current official documentation for Astro/Preact/MDX compatibility, browser compilation, and GitHub Pages deployment. This plan intentionally does not pin unverified package versions or assume a specific editor library.

## Native wallet decision

The user selected Kayros-native signing first. Implemented: encrypted local Ed25519 wallets and backups; SHA-256 document fingerprints; required-public-key lists; portable, bounded, versioned packages; local signature verification; all-parties registration gating; and the documented Kayros `/api/lightnet/hash` adapter. No other chain or WalletConnect dependency is used.

Recommended next: agree the native wallet extension request protocol against SIGNING.md, provide HTTPS for LAN/mobile signing, provision the Kayros data type, add durable registration receipts and inclusion-proof verification, and support merging independently signed copies. A passkey-backed adapter remains an alternative after defining origin and recovery rules. Never equate an author-written `status` field with verified signatures or a confirmed chain record.

## Security implementation update

1. Exact npm and Node versions, lockfile integrity, commit-pinned Actions, and minimal build/deploy permissions are implemented.
2. Native key handling now resides in extension/, a buildable Manifest V3 Chrome extension. The editor only requests reviewed signatures and public keys.
3. The extension independently reconstructs approved contracts and reviews all fields/parties/template versions and verified previous-signature differences.
4. packages/contract-kit provides public signing, merging, verification, and portable final proofs; restricted MDX imports expose ContractSign and ContractProof.
5. Independent security review, authenticated Kayros inclusion proofs, and Chrome Web Store publication remain outstanding.
