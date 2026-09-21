# @tractate/contract-kit

Public, GPL-3.0 library for approved-template contract packages, Ed25519 signing, signing reviews, signature merging, and portable proof verification. Source lives in `packages/contract-kit/`; build from the repository root with `npm run build:library`.

The build produces an npm-compatible tarball in `public/lib/`, plus a standalone ESM module at https://kuip.github.io/tractate/lib/contract-kit.js. This repository does not publish to the npm registry automatically. Install the packaged release using:

```sh
npm install https://kuip.github.io/tractate/lib/tractate-contract-kit-0.2.0.tgz
```

For repeatable installations retain your lockfile and integrity hash. Verify release provenance independently for security-sensitive use. The default approval list and fixed repository origin are bundled; consumers cannot request arbitrary URLs through the package API.

## Signing and proving

```js
import {
  signPackage, mergeSignedPackages, verifyPackage,
  createSigningProof, verifySigningProof,
} from '@tractate/contract-kit';

// Wallet context ONLY. Never pass private seeds into MDX or the editor.
const signature = await signPackage(portableContract, privateSeed);
const signedCopy = {...portableContract, signatures: [...portableContract.signatures, signature]};

// Combine parallel copies only if their exact signed bytes match.
const combined = await mergeSignedPackages([signedCopy, otherSignedCopy]);
const status = await verifyPackage(combined);
if (!status.complete) throw new Error('Missing signatures: ' + status.missing.join(', '));
const proof = await createSigningProof(status.envelope);
// Distribute this JSON file to every party.
const independentlyVerified = await verifySigningProof(proof);
console.log(independentlyVerified.packageHash);
```

`signPackage` independently hydrates and validates the reference-only package. `signEnvelope` is a lower-level primitive for already validated envelopes. `verifyPackage` reports signed/missing keys, ignored invalid/stale/duplicate signature count, and the canonical signed-package hash when complete. `verifySigningProof` rejects incomplete or mismatched proofs. `reviewContract` enumerates every field; `reviewChanges` compares verified snapshots. `requestWallet` invokes the extension bridge and never handles a private key.

Proof format: `{format: "tractate-signing-proof-v1", contract: <version-2 portable package>, packageHash: <canonical hash>}`. Templates, field values, instance ID, name, and required-party list are bound by the signatures. Partial packages have no final signing proof. A hash or a claimed `complete` flag alone is not proof.

These APIs prove possession of signing keys and agreement on the signed bytes. They do not identify people, enforce execution rules, or prove Kayros inclusion. The existing registration commitment remains compatible. Receipt/checkpoint authentication must be integrated separately before claiming inclusion/finality. New packages require access to the pinned GitHub template; the library keeps an in-memory template cache.

## MDX contracts

```mdx
import { ContractSign, ContractProof } from '@tractate/contract-kit/mdx';

<Contract title="Agreement">
  <Field label="Recipient" value="" />
  <ContractProof />
  <ContractSign label="Review and sign" />
</Contract>
```

The Tractate compiler accepts only these named, unaliased imports from this exact module. It resolves them to bundled components rather than evaluating arbitrary imports. `ContractSign` requests review of the host's current document; an MDX author cannot supply alternate signing bytes. `ContractProof` independently verifies the host-provided portable package and displays the signature count. The iframe's network policy permits only the fixed GitHub template origin. Functions, namespace/default imports, aliases, arbitrary modules, expressions, and event handlers remain unavailable to untrusted MDX.

Use `contracts/demos/signing-and-proof.mdx` for a complete tabs-and-signing demo. External trusted applications may use the ordinary ESM APIs directly. Full host support is required for the MDX components' `tractate:action`, `tractate:proof-request`, and `tractate:proof` messages; the included editor implements it.
