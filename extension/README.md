# Tractate Chrome wallet

A Manifest V3 extension for native Ed25519 signing. Keys and passwords stay in the extension; the editor receives public keys and signatures. This is an application wallet for Kayros contracts, not an existing Kayros-standard extension API, and has not received an independent security audit.

## Build and install

From the repository root:

```sh
npm ci --ignore-scripts
npm run build:extension
```

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode, select **Load unpacked**, and choose this repository's `extension/dist` directory.
3. Open the extension to create a wallet or import an encrypted backup. Export a backup and retain the password separately.
4. Reload https://kuip.github.io/tractate/ (or http://localhost:4321/).
5. In the editor, choose **Sign → Connect Chrome wallet**, approve sharing a public key, set all required parties, and choose **Review in Chrome wallet**.

`public/downloads/tractate-wallet.zip` contains the built extension and can be uploaded to the Chrome Web Store dashboard. Store publication/review and installation in a user's browser are separate steps; no store account or signing key is included. Unzip it before using Load unpacked. The built directory is regenerated and ignored by Git.

## Security boundary

- Requests are accepted from the top-level `https://kuip.github.io/tractate/` path and localhost/127.0.0.1 port 4321. LAN HTTP and other sites are not allowed. Match patterns are further restricted by runtime URL validation.
- A request's site and document ID come from Chrome, never from a page-supplied origin. Responses return only to that original document. Only one request can be pending; requests expire after five minutes. Closing the review window rejects the request.
- Public-key disclosure and each signature require approval in an extension-owned window. The extension independently downloads the approved commit-pinned template, checks its hash, reconstructs values, and validates the party list. Arbitrary bytes and page-supplied MDX source cannot be signed through the bridge.
- The signing screen lists every field (including inactive tabs), required party, template version, fingerprint, and changes from the last locally stored signature by the selected key. Exact document terms are available as text. A changed template needs review of all terms, not just field differences.
- Last-signed documents are kept in extension-local storage for comparison, authenticated by the stored signature. There is no cross-device history sync. They contain public contract values; encrypted wallet backups contain only the encrypted seed and its metadata.
- Chrome local/session storage is restricted to trusted extension contexts. Encrypted seeds use PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM. Passwords are cleared after operations; decrypted seed buffers are cleared. JS runtimes cannot guarantee erasure of every memory copy.
- No remote executable code, eval, inline script, page-accessible extension resources, or externally-connectable RPC are enabled. Only pinned bundled code runs in the extension. GitHub access fetches template text, not executable modules.
- Existing v1 encrypted wallet backups are compatible. The editor's **Move an existing browser wallet** exports legacy encrypted backups without unlocking them. Import in this extension. Old browser storage is not deleted automatically.

The approval list is bundled into the extension. Publish/reinstall an extension update to approve new templates; a website deployment alone cannot change the installed wallet's list. A compromised editor may request misleading operations but cannot directly unlock the extension wallet. Extension compromise or device compromise remains outside that protection.

## Independent proof verification

Every party should receive the final `.proof.json` file. Open the extension's **Verify signing proof** file picker to verify it independently of the editor. Verification reconstructs the approved document and checks all required public keys against the same signed bytes. It does not establish who owns a key, that every party received the file, or that Kayros included the package in an authenticated checkpoint. No live registration is performed by proof verification.
