# Native signing format (version 1)

This is Tractate's native Ed25519 consent format for Kayros contracts. It is a new application-level format, not a claim that Kayros already has a standardized browser wallet API. Kayros itself currently accepts hash records; it does not verify these consent signatures at the hash endpoint.

## Parties and identity

A required party is `ed25519:` plus the lowercase 64-hex-digit public key. The list is sorted, unique, and nonempty before registration, with at most 20 parties. Public keys establish control of a key, not a person's real-world identity. Parties must exchange and confirm their keys through a channel they trust. The MDX Author/Recipient text fields do not define the required signer list: set that list explicitly in Sign before anyone signs.

## Signed bytes

UTF-8 bytes of compact `JSON.stringify` with this exact property order:

```json
{
  "domain": "tractate:kayros:contract-consent:v1",
  "version": 1,
  "id": "unique contract instance ID",
  "name": "filename without extension",
  "source": "exact MDX including current field values",
  "parties": ["ed25519:..."]
}
```

Do not trim, normalize newlines, or otherwise rewrite signed source. The instance ID is 16 random bytes represented as 32 lowercase hex digits when created by the app. Every party signs the same bytes using Ed25519 (RFC 8032). Signatures and the display fingerprint are stored as lowercase hex: signature is 64 bytes; digest is SHA-256 of the signed bytes (32 bytes). A signature record holds `{signer, digest, signature}`. Verification uses strict Ed25519 verification, checks the current digest, and counts each required public key once. Empty, duplicate, forged, stale, and nonparty signatures cannot complete a contract.

Source, filename, and party-list changes invalidate old signatures for registration. Old attestations can remain in the portable package; they are never counted for a changed version. A reversion to the exact signed bytes restores their validity. Signatures are collected sequentially by sending the current package to each signer. Automatic merging of separately signed branches is not implemented.

## Native local wallet

A random 32-byte Ed25519 seed is encrypted with AES-256-GCM. A 256-bit encryption key is derived from the user password using PBKDF2-HMAC-SHA256 with 600,000 iterations and a random 16-byte salt. AES-GCM uses a random 12-byte IV and authenticates the public-key identifier as additional data. The encrypted keystore includes version, algorithms, iterations, publicKey, salt, iv, and ciphertext.

Only encrypted keystores persist in browser storage or wallet backups. Signing decrypts a seed temporarily, verifies its public-key binding, signs, and clears the byte buffer; passwords are cleared after signing and when closing the dialog. JavaScript cannot promise complete memory zeroization of engine copies. Use HTTPS or localhost. Backups and passwords are required for recovery; clearing browser storage without a backup can lose access to the signing key. The private seed and password are never part of a contract package, QR, share link, or Kayros request.

A future extension should keep the seed outside the page and expose account selection plus a reviewed sign-contract request carrying these exact public bytes. Provider discovery, request names, permissions, error codes, and external-wallet authentication still need an agreed protocol; no existing native extension is assumed.

## Portable package

`{version, id, name, source, parties, signatures}`. The source is authoritative for the current Field values. The package is JSON, gzip-compressed and URL-safe base64-encoded into `#bundle=...`, with a `?receive=1` navigation marker. The marker ensures opening a share link from the same app performs a fresh navigation. The fragment is not sent in the initial HTTP request. Anyone possessing the link can decode it.

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

`data_item` is SHA-256 of compact JSON with this exact property order: `{version,id,name,source,parties,signatures}`. For this registration hash, `signatures` contains one verified current signature per required party, ordered by the sorted party list; each record has `{signer,digest,signature}`. Stale, duplicate, and invalid records are excluded. Thus the hash binds the signed document and the evidence of every required signature. This is Tractate's proposed application mapping, not an existing Kayros execution rule.

Submission is explicit and checks signature completeness again immediately before sending. No private contract text, password, or wallet seed is submitted. The API key goes only in the request header and is cleared on dialog close. A successful response shows the returned `hash` and `timeuuid`; this means the API accepted the record, not that a Merkle inclusion proof or execution outcome has been verified. Persisted receipts and proof verification are follow-up work.

Tests use deterministic test keys and a mocked registration endpoint. No live contract record has been submitted by the implementation work.
