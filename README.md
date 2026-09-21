# Tractate

An MDX editor/consumer workspace for crypto contracts on the **Kayros lightchain**.

Built with Astro, Preact, and MDX. The app provides contract authoring, portable sharing, native Ed25519 signing, and a Kayros hash-registration adapter. It does not execute contracts. Live registration needs a provisioned Kayros data type and any required API key.

## Run locally

Use Node.js 22.12 or newer (an active LTS release is recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro. To test the production build and offline behavior:

```sh
npm run build
npm run preview
```

Offline caching is enabled in production builds only, over HTTPS or localhost. Visit once online and let the app finish caching before reopening offline. Browser storage can be evicted; export important work. Offline support means reopening the hosted app, not opening an HTML file with `file://`.

## Workspace

- **Source:** a CodeMirror editor with highlighting, line numbers, undo/redo, and line wrapping.
- **Output:** the rendered contract with editable fields. Field edits update the MDX source, autosaved draft, and exported file.
- **Both:** source on the left and output on the right, with a draggable, keyboard-accessible divider. On mobile the panes stack vertically.
- **File:** new contract, MDX import/export, and contract navigation based on the `contracts/` directory tree.
- **Insert:** supported contract components and headings.
- **Help:** the supported writing syntax.

Use the View menu to select Source, Output, or Both, and File → Export MDX to download. Source and output have separate status rows. View choices are Source, Both, Output, and No Menu. No Menu shows output with Send → by Share / by QR, Sign, and Register. The editor menu and wordmark are hidden; press the logo to restore them. View changes retain the mounted editor and output. Each page load starts in Both view so output is visible immediately. One current draft, including its filename and field values, is autosaved to IndexedDB on this device. A notification from another tab pauses autosave to reduce accidental overwrites; export before reloading to resolve that conflict. Storage failures are reported with an export fallback.

The app follows the system light/dark preference and bundles Roboto Condensed and Roboto Mono. Kayros requests are made only when Submit to Kayros is pressed after every required party has signed. Wallet signing is local and uses no other blockchain.

## Supported MDX

Use Markdown headings, lists, tables, blockquotes, code blocks, and links, plus these contract components:

```mdx
<Contract title="Contribution agreement" network="Kayros" status="Draft">
  <Field label="Author" value="" placeholder="Your identity" />
  <Field label="Recipient" value="" placeholder="Contributor identity" />
</Contract>

<Callout title="Local draft">
  This contract has not been submitted to the lightchain.
</Callout>
```

Properties must be quoted strings. Every `Field` requires `value=""` (or an initial value) and can include a `placeholder` property. Arbitrary JavaScript expressions, imports/exports, raw HTML, images, and unknown components are rejected. Documents are limited to 100,000 characters. Component labels such as `status="Signed"` are author-written text and do not establish verified chain state.

Compilation runs in a worker. Invalid input leaves the last valid output visible and displays the error. The compiled presentation runs in an iframe without same-origin access; its content security policy blocks network connections, forms, and images. Only the small bundled renderer evaluates the validated compiler output. The MDX parser rules and iframe boundary must be reviewed before expanding the supported syntax or adding chain actions.

## Validation

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests cover editing, view switching, malformed source recovery, storage restoration, export, mobile menus, import, and production offline reload. `npm run format` formats the source.

## GitHub Pages

The editor is published at **https://kuip.github.io/tractate/** from **https://github.com/kuip/tractate**. Pushes to main (or manual workflow dispatch) run validation, verify approved contracts on GitHub, run browser tests, and deploy through GitHub Actions. Pages must use GitHub Actions as its source.

For a project hosted at `/tractate/`:

```sh
BASE_PATH=/tractate/ SITE_URL=https://kuip.github.io npm run build
BASE_PATH=/tractate/ npm run preview
```

For an account Pages site or a custom domain, use `/` as `BASE_PATH`. The worker and cached URLs are scoped to this base path. Updates wait for the user to apply them after the current draft is saved.

## Project references

- [Implementation plan](PLAN.md)
- [Kayros](https://github.com/ctzurcanu/kayros)
- Local Kayros checkout: `../kayros/`, especially `internal/proto/` and `lightnet/proto/lightnet.proto`.
- [Astro Preact integration](https://docs.astro.build/en/guides/integrations-guide/preact/)
- [MDX compiler](https://mdxjs.com/packages/mdx/)

The sample agreement is a presentation template, not executable lightchain code. Native signatures and Kayros hash registration provide consent evidence and a record, not contract execution. See [native signing and registration](SIGNING.md) for the exact format and remaining deployment requirements.

## Static assets and contract files

Put static files in `public/assets/`. Files under `public/` are served unchanged: `public/assets/tractate.svg` becomes `/assets/tractate.svg` locally. Prefix URLs with the configured base path on GitHub Pages. The header uses `public/assets/tractate.svg`; the SVG and `tractate.png` are also registered as browser icons.

Each contract lives in one `.mdx` file under `contracts/<type>/`. The initial directories are `agreements/`, `transfers/`, and `escrow/`. `contracts/agreements/contribution.mdx` is the sample. Files are discovered recursively for **File → Contracts**, and directory names become nested menu entries. Rebuild after adding files to a static deployment. Export edited MDX and save it into this directory to update the repository; browser autosave stays on the device.

## Contract menus and tabs

Open **File → Contracts → demos → Menus and tabs demo**. Its source is `contracts/demos/menus-and-tabs.mdx`. A direct link, `/?contract=demos/menus-and-tabs.mdx`, opens the output immediately and saves edits separately from the main workspace draft.

```mdx
<Menu label="Resources">
  <MenuItem label="MDX documentation" href="https://mdxjs.com/docs/" />
</Menu>
<Tabs label="Agreement sections">
  <Tab label="Parties">
    <Field label="Author" value="" placeholder="Author identity" />
  </Tab>
  <Tab label="Terms">
    <Field label="Purpose" value="" placeholder="Describe the contribution" />
  </Tab>
</Tabs>
```

Application menus and contract menus use the same shared cascading component and styles. Each child opens 20px to the right of its parent, resets to the parent panel’s top, and shows the parent item’s title. Panels narrow at the viewport edge and scroll when necessary. Click outside or press Escape to dismiss; arrow keys navigate levels. Menus can nest. Menu items are links, with `https`, `http`, `mailto`, or local anchor destinations; they do not execute arbitrary scripts. Tabs accept `Tab` children with quoted labels, keep inactive panels mounted, and support arrow keys, Home, and End. Tab selection survives field recompilation; a page reload starts at the first tab. Field values are saved independently of the selected tab.

## Send, Sign, Register

Choose **View → No Menu** (or press the logo) to open the contract action menu.

- **Send → by Share:** generates a portable link with a pinned approved GitHub template reference, current field values, required public keys, and all existing signatures. Source code is excluded. Use the browser share sheet where available, copy the link, or download a `.tractate.json` package.
- **Send → by QR:** encodes the same reference, values, parties, and signatures. If it exceeds QR capacity, use the share link or package; nothing is silently omitted.
- **Sign:** connect the Chrome wallet extension, create or import an encrypted wallet there, exchange `ed25519:` public keys, set the complete required-party list, review the document, and approve signing in the extension. Each party can share the partly signed package with the next signer. Export the encrypted wallet backup; it is separate from a contract package.
- **Register:** enabled only when every required public key has a verified signature on the exact current source and party list. The dialog displays the endpoint and asks for the Kayros data type and API key. Submit records the hash of the signed package. Keep the package itself to prove what was registered.

Wallet creation/unlocking uses WebCrypto inside the Chrome extension. Its editor bridge supports the deployed HTTPS site and localhost:4321. HTTP LAN access supports editing, sharing, and signature verification, but cannot request signatures. Native wallets use Ed25519; there is no WalletConnect project ID, Ethereum account, gas, or other-chain transaction.

Share links hold compressed packages in the URL fragment. Anyone with the link can read the package; the receiving app imports it into a separate local draft. Values and signatures survive reload. No backend stores readable contracts automatically. Clipboard and native share APIs depend on browser support; download and manual copy remain available.

Set `PUBLIC_KAYROS_DATA_TYPE` from `.env.example` if needed. The suggested `tractate_v1` must be provisioned server-side for a 32-byte item width before real registration. API keys are entered at runtime, held only in the registration dialog, and excluded from files and links. The live service’s health, status, and CORS were checked; live hash submission was not performed.

## Approved GitHub contracts

Shared links, QR codes, and downloaded contract packages use format version 2. They contain a short immutable reference such as `712db09b57b9ef82a15c41b042e422462d5492f5/contracts/agreements/contribution.mdx`, plus field values, instance metadata, parties, and signatures. The receiver prefixes the reference with `https://raw.githubusercontent.com/kuip/tractate/`, downloads the MDX, and verifies its SHA-256 before applying values. Embedded source, branch names, foreign repositories, and unapproved revisions are rejected.

The repository-controlled `contracts/approved.json` lists approved references and hashes. Both initial sample contracts are approved. To approve a new or changed contract:

1. Commit and push its `contracts/<type>/<name>.mdx` file to GitHub.
2. Add its full 40-character commit SHA, file path, and file SHA-256 to `contracts/approved.json` in a subsequent commit.
3. Run `npm run verify:contracts`, then push the approval. Pages rebuilds with the updated list.

Editing output fields preserves template approval. Source structure changes remain editable/exportable locally, but cannot be sent or signed until the new revision is published and approved. Sending, signing, and registering recheck GitHub availability. Receiving a new package needs GitHub access; existing local drafts remain editable offline. Version 1 packages containing source are no longer accepted, and old signatures must be collected again under the version 2 signing format. Encrypted wallet backups remain compatible.

## Chrome wallet and public signing library

Private-key operations now run in the separate **Tractate Chrome wallet extension**, not in the editor. Build with `npm run build:extension` and load `extension/dist` through Chrome's Load unpacked command. Detailed installation, encrypted-backup migration, allowed sites, and security boundaries are in [extension/README.md](extension/README.md). The deployable archive is [tractate-wallet.zip](https://kuip.github.io/tractate/downloads/tractate-wallet.zip). Creating or importing a wallet and approving signatures happens only in the extension window.

The review displays all fields across all tabs, all required parties, the pinned template, and changes since this wallet's previous signature on the same instance. Each signature requires explicit review. The editor never requests a wallet password. Existing encrypted backups remain compatible; use **Sign → Move an existing browser wallet** to export a legacy backup, then import it in the extension.

Once all parties sign, **Download signing proof** creates a reference-only `.proof.json` file for distribution to every party. It can be independently verified in the extension or with [@tractate/contract-kit](packages/contract-kit/README.md). The library supports merging signatures from identical versions. A signing proof proves all required keys signed; it does not claim authenticated Kayros inclusion. The extension and library use the same version-2 signed bytes as before.

The public library is available as a [standalone ESM module](https://kuip.github.io/tractate/lib/contract-kit.js) and an [npm-compatible package](https://kuip.github.io/tractate/lib/tractate-contract-kit-0.3.0.tgz). No npm registry publication is required. The **Signing and proof demo** imports `ContractSign` and `ContractProof` from `@tractate/contract-kit/mdx`. The compiler permits this explicit capability import while continuing to reject arbitrary executable imports.

## Pinned builds

Direct npm versions match the lockfile exactly; transitive packages retain lockfile versions and integrity hashes. CI uses `npm ci --ignore-scripts`, an exact Node version from `.node-version`, commit-pinned Actions, no retained checkout credentials, and separate read-only build versus deployment permissions. `npm run check:pins` enforces the pins. Update dependencies intentionally and commit both manifests together. The hosted runner's OS packages and browser system dependencies are still managed by GitHub/Ubuntu; this is not a fully hermetic build or a security guarantee.
