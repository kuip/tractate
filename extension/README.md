# Tractate Chrome wallet

A Manifest V3 extension for native Ed25519 and Web eID card signing. Keys and passwords stay in the extension; the editor receives public keys and signatures. This is an application wallet for Kayros contracts, not an existing Kayros-standard extension API, and has not received an independent security audit.

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


## eID card signing

The Web eID adapter covers the cards supported by the installed [Web eID driver](https://github.com/web-eid/libelectronic-id): Estonia (including e-Residency), Finland, Latvia and Lithuania. Card generations and OS-specific middleware determine actual availability; Lithuania may need its PKCS#11 module. This integration was tested with generated certificates and a simulated native application, not physical cards. Sweden's cards, BankID, Mobile-ID and Smart-ID are not supported by this adapter.

1. Install the official [ID software / Web eID application](https://www.id.ee/en/article/install-id-software/) and the card reader's required drivers. Do not export card keys.
2. Build/update and reload `extension/dist` in Chrome. Version 0.3 adds the `nativeMessaging` permission. Copy the extension ID from `chrome://extensions`.
3. Register the existing Web eID executable for that ID (macOS, Linux or Windows, Node.js required):

   ```sh
   node extension/native/install-card-bridge.mjs YOUR_EXTENSION_ID
   ```

   The same script is published at https://kuip.github.io/tractate/downloads/install-card-bridge.mjs. Run it with `--dry-run` first to inspect the manifest without making changes. An optional second positional argument supplies the installed `eu.webeid.json` path if automatic discovery fails. The script registers `dev.tractate.webeid` in Chrome's per-user native-host directory (and HKCU on Windows). It does not change the official Web eID registration, download an executable, or grant access to other extensions. Run it again if the extension ID changes. To uninstall, remove the returned manifest file and, on Windows, the HKCU native-host key `Software\Google\Chrome\NativeMessagingHosts\dev.tractate.webeid`.
4. Open the HTTPS editor. In **Sign → Connect Chrome wallet**, choose **Read eID signing card** in the wallet window, then **Share public key**. Back in the editor, add that key to the parties and confirm the full party list.
5. Choose **Review in Chrome wallet**, read the card again in that approval window, review all fields/terms/parties, check the review box and approve. Enter the signing PIN only in Web eID's native dialog. The software-wallet password field is not used for cards. The native operation expires after four minutes.
6. Send the current package to the other parties. Download the final proof once everyone has signed.

The extension computes the hash itself after independently loading the approved template and reviewing the contract; the editor cannot supply arbitrary bytes for card signing. The returned signature is verified before it is saved or released. ECDSA and RSA signatures are verified independently by the public library and other parties.

A certificate fingerprint identifies the exact certificate. Renewal gives a new party identifier; agree on it before signing. Certificates in shared proofs can contain names and personal identifiers. No certificate or identity data is submitted to Kayros—only the final package hash.

**Trust limit:** these proofs establish control of the selected certificate key, not a government-verified identity or qualified electronic signature. Issuer chains, revocation and trusted timestamps are not validated. Subjects are labeled unverified. Signing rejects certificates outside their validity period and authentication-only certificates. Historical proof verification does not claim a trusted signing time or retroactively invalidate key signatures after expiry.
