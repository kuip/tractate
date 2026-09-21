import { parseCardAlgorithm } from './certificates.js';
import {
  digest,
  hydrateEnvelope,
  portableEnvelope,
  verifiedSigners,
  validAttestations,
  type Envelope,
} from './envelope.js';
import { sourceHash } from './templates.js';
// Stable registration commitment, independent of invalid or duplicate attestations.
export async function signedPackageHash(envelope: Envelope) {
  const records = await validAttestations(envelope);
  if (!envelope.parties.length || records.length !== envelope.parties.length)
    throw new Error('Every required party must sign this version.');
  return sourceHash(
    JSON.stringify({
      version: 2,
      id: envelope.id,
      name: envelope.name,
      reference: envelope.reference,
      sourceHash: sourceHash(envelope.source),
      parties: envelope.parties,
      signatures: envelope.parties.map((party) => {
        const { signer, digest, signature, certificate, algorithm } =
          records.find((item) => item.signer === party)!;
        return {
          signer,
          digest,
          signature,
          ...(certificate
            ? { certificate, algorithm: parseCardAlgorithm(algorithm) }
            : {}),
        };
      }),
    }),
  );
}
export async function verifyPackage(value: unknown) {
  const envelope = await hydrateEnvelope(value);
  const signed = await verifiedSigners(envelope);
  const missing = envelope.parties.filter((party) => !signed.includes(party));
  const complete = envelope.parties.length > 0 && missing.length === 0;
  return {
    envelope,
    digest: digest(envelope),
    signed,
    missing,
    complete,
    identityVerified: false as const,
    ignoredSignatures: envelope.signatures.length - signed.length,
    packageHash: complete ? await signedPackageHash(envelope) : null,
  };
}
export async function createSigningProof(envelope: Envelope) {
  const contract = await portableEnvelope(envelope, true);
  const verified = await verifyPackage(contract);
  if (!verified.complete) throw new Error('The contract is not fully signed.');
  return {
    format: 'tractate-signing-proof-v1' as const,
    contract,
    packageHash: verified.packageHash,
  };
}
export async function verifySigningProof(value: unknown) {
  const proof = value as {
    format?: unknown;
    contract?: unknown;
    packageHash?: unknown;
  };
  if (proof?.format !== 'tractate-signing-proof-v1')
    throw new Error('Invalid signing proof.');
  const result = await verifyPackage(proof.contract);
  if (!result.complete || result.packageHash !== proof.packageHash)
    throw new Error('Signing proof is incomplete or its commitment differs.');
  return result;
}

/** Combine independently signed copies only when every signed byte agrees. */
export async function mergeSignedPackages(values: unknown[]) {
  if (!values.length || values.length > 20)
    throw new Error('Supply 1–20 signed packages.');
  const results = await Promise.all(values.map(verifyPackage));
  const first = results[0];
  if (results.some((result) => result.digest !== first.digest))
    throw new Error(
      'Cannot merge signatures from different contract versions.',
    );
  const unique = new Map<
    string,
    Awaited<ReturnType<typeof validAttestations>>[number]
  >();
  for (const result of results)
    for (const record of await validAttestations(result.envelope))
      unique.set(record.signer, record);
  return portableEnvelope({
    ...first.envelope,
    signatures: [...unique.values()],
  });
}
