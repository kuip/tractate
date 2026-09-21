# Native signing format (version 2)

This is Tractate's native Ed25519 consent format for Kayros contracts. It is a new application-level format, not a claim that Kayros already has a standardized browser wallet API. Kayros itself currently accepts hash records; it does not verify these consent signatures at the hash endpoint.

## Parties and identity

A required party is `ed25519:` plus the lowercase 64-hex-digit public key. The list is sorted, unique, and nonempty before registration, with at most 20 parties. Public keys establish control of a key, not a person's real-world identity. Parties must exchange and confirm their keys through a channel they trust. The MDX Author/Recipient text fields do not define the required signer list: set that list explicitly in Sign before anyone signs.

## Signed bytes

UTF-8 bytes of compact `JSON.stringify` with this exact property order:

```json
{
  "domain": "tractate:kayros:contract-consent:v2",
  "version": 2,
  "id": "unique contract instance ID",
  "name": "filename without extension",
  "reference": "full commit SHA/contracts/type/name.mdx",
  "sourceHash": "SHA-256 of exact reconstructed MDX including current field values",
  "parties": ["ed25519:..."]
}
```

Do not trim, normalize newlines, or otherwise rewrite signed source. The instance ID is 16 random bytes represented as 32 lowercase hex digits when created by the app. Every party signs the same bytes using Ed25519 (RFC 8032). Signatures and the display fingerprint are stored as lowercase hex: signature is 64 bytes; digest is SHA-256 of the signed bytes (32 bytes). A signature record holds `{signer, digest, signature}`. Verification uses strict Ed25519 verification, checks the current digest, and counts each required public key once. Empty, duplicate, forged, stale, and nonparty signatures cannot complete a contract.

Source, filename, and party-list changes invalidate old signatures for registration. Old attestations can remain in the portable package; they are never counted for a changed version. A reversion to the exact signed bytes restores their validity. Signatures are collected sequentially by sending the current package to each signer. The public library can merge separately signed copies when their signed digests match.

## Native Chrome extension wallet

A random 32-byte Ed25519 seed is encrypted with AES-256-GCM. A 256-bit encryption key is derived from the user password using PBKDF2-HMAC-SHA256 with 600,000 iterations and a random 16-byte salt. AES-GCM uses a random 12-byte IV and authenticates the public-key identifier as additional data. The encrypted keystore includes version, algorithms, iterations, publicKey, salt, iv, and ciphertext.

Only encrypted keystores persist in extension-local wallet storage or wallet backups. Previous signed contract snapshots are stored separately in trusted extension storage for review comparisons. Signing decrypts a seed temporarily, verifies its public-key binding, signs, and clears the byte buffer; passwords are cleared after signing and when closing the dialog. JavaScript cannot promise complete memory zeroization of engine copies. Use HTTPS or localhost. Backups and passwords are required for recovery; clearing browser storage without a backup can lose access to the signing key. The private seed and password are never part of a contract package, QR, share link, or Kayros request.

The Manifest V3 extension in extension/ implements public-key connection and reviewed contract signing. The editor bridge sends only a version-2 portable package. Chrome authenticates the requesting site/document; the extension independently hydrates the approved template before asking for explicit review and password entry. It returns only a public key or an attestation. See extension/README.md for origin restrictions, request expiry, storage isolation, and migration.

## Portable package

`{version, reference, values, id, name, parties, signatures}`. No source code is transmitted. The receiver validates the pinned reference against contracts/approved.json, fetches it from the fixed raw.githubusercontent.com/kuip/tractate/ prefix, verifies its SHA-256, then applies the values to numbered Field attributes with HTML entity escaping. Exact reconstruction is required before signing or sending. Unknown, missing, and extra field identifiers are rejected. The package is JSON, gzip-compressed and URL-safe base64-encoded into `#bundle=...`, with a `?receive=1` navigation marker. The marker ensures opening a share link from the same app performs a fresh navigation. The fragment is not sent in the initial HTTP request. Anyone possessing the link can decode it.

Import validates shape and bounds before use. Source is capped at 100,000 characters, signatures at 100, compressed links at 400,000 encoded characters, and decompressed JSON at 600,000 bytes. Imported MDX is still compiled through the restricted component parser. QR capacity is finite: oversize packages produce an explicit fallback instead of dropping fields or signatures. Downloaded `.tractate.json` files can be loaded through File → Import contract.

## Kayros registration mapping

Read-only checks confirmed health and browser CORS at `https://kayros.provable.dev`. The root page returns 404, but `/health` and `/api/lightnet/status` respond. The adjacent Kayros handlers define:

```text
POST https://kayros.provable.dev/api/lightnet/hash
Content-Type: application/json
X-User-Key: <runtime API key, if required>
{"data_type":"tractate_v1","data_item":"64 lowercase hex digits"}
```

`data_type` is an ASCII name (1–32 bytes), despite older protobuf comments suggesting a fixed 32-byte value. The chosen name must already be provisioned server-side for a 32-byte item. The app does not create a data type or configure server permissions.

`data_item` is SHA-256 of compact JSON with this exact property order: `{version,id,name,reference,sourceHash,parties,signatures}`. For this registration hash, `signatures` contains one verified current signature per required party, ordered by the sorted party list; each record has `{signer,digest,signature}`. Stale, duplicate, and invalid records are excluded. Thus the hash binds the signed document and the evidence of every required signature. This is Tractate's proposed application mapping, not an existing Kayros execution rule.

Submission is explicit and checks signature completeness again immediately before sending. No private contract text, password, or wallet seed is submitted. The API key goes only in the request header and is cleared on dialog close. A successful response shows the returned `hash` and `timeuuid`; this means the API accepted the record, not that a Merkle inclusion proof or execution outcome has been verified. Persisted receipts and proof verification are follow-up work.

Tests use deterministic test keys and a mocked registration endpoint. No live contract record has been submitted by the implementation work.

## Public library and signing proofs

The implementation is shared through packages/contract-kit. A final proof contains `{format: "tractate-signing-proof-v1", contract, packageHash}`. `verifySigningProof` reconstructs the approved contract, verifies every required signature, and recomputes the canonical registration commitment; it does not trust a status flag. `mergeSignedPackages` rejects different signed digests and retains one valid signature per key. Every party should receive the final proof. Kayros inclusion and authenticated checkpoint verification remain separate from this signing proof.


## Certificate-backed card signatures (library 0.3.0)

A card party is `x509:` plus the lowercase SHA-256 fingerprint of its DER signing certificate. The sorted required-party list may mix card and Ed25519 identifiers. Card attestations extend the existing record with `{certificate, algorithm}`, where `certificate` is canonical base64 DER and `algorithm` has property order `{cryptoAlgorithm,hashFunction,paddingScheme}`. The canonical registration record uses `{signer,digest,signature,certificate,algorithm}` for cards; Ed25519 records remain unchanged. The consent payload/domain and package version remain v2. Old libraries reject unknown card parties rather than accepting unverifiable signatures.

The card signs a SHA-2 digest of exactly the same consent bytes as other parties. The record's display `digest` remains SHA-256 regardless of the selected signing hash. Supported algorithms are ECDSA P-256/P-384/P-521 with raw fixed-width r||s signatures, RSA PKCS#1 v1.5 and RSA-PSS (salt length equals hash length), SHA-256/384/512, RSA modulus at least 2048 bits. Verification checks the exact certificate fingerprint, algorithm and payload; altered certificates, algorithms or fields cannot count as a valid signature. Card and ordinary signatures can be merged into one proof.

`verifiedSigners`, `validAttestations`, `canRegister`, `signedPackageHash`, `isSignedReview` and the application's `registrationPayload` are asynchronous in 0.3.0. All permission checks must await completion. The editor discards obsolete verification results when its document changes.

A valid signature is not a verified legal identity. Verification reports `identityVerified: false`; certificate issuer trust, revocation, qualified status and trusted signing time are not implemented. Self-signed signing certificates can function as manually confirmed keys. Signing requires current certificate dates and document-signing key usage, but historical key-signature verification deliberately does not use the current date. Web eID handles PIN entry and the private key stays on the card. The extension requires HTTPS for card operations. See extension/README.md for setup and card coverage.
