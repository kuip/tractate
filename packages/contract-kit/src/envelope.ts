import {
  certificateParty,
  parseCardAlgorithm,
  verifyCertificateSignature,
  type CardAlgorithm,
} from './certificates.js';
import {
  approvedReference,
  bindTemplate,
  loadTemplate,
  populateTemplate,
  sourceHash,
} from './templates.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { MAX_SOURCE_LENGTH } from './constants.js';

export type Attestation = {
  signer: string;
  digest: string;
  signature: string;
  certificate?: string;
  algorithm?: CardAlgorithm;
};
export type Envelope = {
  version: 2;
  reference?: string;
  id: string;
  name: string;
  source: string;
  parties: string[];
  signatures: Attestation[];
};
// A Tractate-native signing format for Kayros, independent of any other chain.
export const signingDomain = 'tractate:kayros:contract-consent:v2';
export function signingBytes(envelope: Envelope) {
  return new TextEncoder().encode(
    JSON.stringify({
      domain: signingDomain,
      version: envelope.version,
      id: envelope.id,
      name: envelope.name,
      reference: envelope.reference || '',
      sourceHash: sourceHash(envelope.source),
      parties: envelope.parties,
    }),
  );
}
export function digest(envelope: Envelope) {
  return bytesToHex(sha256(signingBytes(envelope)));
}
export function nativeParty(secret: Uint8Array) {
  return 'ed25519:' + bytesToHex(ed25519.getPublicKey(secret));
}
export function signEnvelope(
  envelope: Envelope,
  secret: Uint8Array,
): Attestation {
  if (!envelope.reference)
    throw new Error('Select an approved GitHub contract before signing.');
  approvedReference(envelope.reference);
  const signer = nativeParty(secret);
  if (!envelope.parties.includes(signer))
    throw new Error('This wallet is not a required party.');
  return {
    signer,
    digest: digest(envelope),
    signature: bytesToHex(ed25519.sign(signingBytes(envelope), secret)),
  };
}
export async function validAttestations(
  envelope: Envelope,
): Promise<Attestation[]> {
  if (!envelope.reference) return [];
  try {
    approvedReference(envelope.reference);
  } catch {
    return [];
  }
  const hash = digest(envelope);
  const payload = signingBytes(envelope);
  const seen = new Set<string>();
  const valid: Attestation[] = [];
  for (const record of envelope.signatures) {
    try {
      if (
        seen.has(record.signer) ||
        !envelope.parties.includes(record.signer) ||
        record.digest !== hash ||
        !(record.signer.startsWith('x509:')
          ? record.certificate &&
            record.algorithm &&
            certificateParty(record.certificate) === record.signer &&
            (await verifyCertificateSignature(
              record.certificate,
              record.algorithm,
              hexToBytes(record.signature),
              payload,
            ))
          : !record.certificate &&
            !record.algorithm &&
            /^ed25519:[a-f0-9]{64}$/.test(record.signer) &&
            ed25519.verify(
              hexToBytes(record.signature),
              payload,
              hexToBytes(record.signer.slice(8)),
              { zip215: false },
            ))
      )
        continue;
      seen.add(record.signer);
      valid.push(record);
    } catch {
      continue;
    }
  }
  return valid;
}
export async function verifiedSigners(envelope: Envelope): Promise<string[]> {
  return (await validAttestations(envelope)).map((record) => record.signer);
}
export async function canRegister(envelope: Envelope) {
  return (
    envelope.parties.length > 0 &&
    (await verifiedSigners(envelope)).length === envelope.parties.length
  );
}
export function parseParties(value: string) {
  const items = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  if (
    items.length > 20 ||
    items.some((item) => !/^(?:ed25519|x509):[a-f0-9]{64}$/.test(item))
  )
    throw new Error(
      'Enter up to 20 party keys, one per party (ed25519: or x509: followed by 64 hex digits).',
    );
  if (new Set(items).size !== items.length)
    throw new Error('Each party must have a different public key.');
  return items.sort();
}
export function parseEnvelope(value: unknown): Envelope {
  const e = value as Envelope;
  if (
    !e ||
    e.version !== 2 ||
    typeof e.id !== 'string' ||
    e.id.length > 128 ||
    !e.id ||
    typeof e.name !== 'string' ||
    e.name.length > 80 ||
    typeof e.source !== 'string' ||
    e.source.length > MAX_SOURCE_LENGTH ||
    !Array.isArray(e.parties) ||
    !Array.isArray(e.signatures) ||
    e.signatures.length > 100
  )
    throw new Error('Invalid contract package.');
  if (e.reference !== undefined) approvedReference(e.reference);
  if (e.parties.some((party) => typeof party !== 'string'))
    throw new Error('Invalid party list.');
  const parties = parseParties(e.parties.join('\n'));
  if (JSON.stringify(parties) !== JSON.stringify(e.parties))
    throw new Error('Party addresses must be normalized and sorted.');
  for (const record of e.signatures) {
    if (
      !record ||
      typeof record.signer !== 'string' ||
      !/^(?:ed25519|x509):[a-f0-9]{64}$/.test(record.signer) ||
      typeof record.digest !== 'string' ||
      !/^[\da-f]{64}$/i.test(record.digest) ||
      typeof record.signature !== 'string' ||
      !/^(?:[\da-f]{2}){64,1024}$/i.test(record.signature)
    )
      throw new Error('Invalid signature record.');
    if (record.signer.startsWith('x509:')) {
      if (
        !record.certificate ||
        certificateParty(record.certificate) !== record.signer
      )
        throw new Error('Card certificate does not match the required party.');
      parseCardAlgorithm(record.algorithm);
    } else if (
      record.certificate ||
      record.algorithm ||
      record.signature.length !== 128
    ) {
      throw new Error('Invalid native signature record.');
    }
  }
  return {
    version: 2,
    reference: e.reference,
    id: e.id,
    name: e.name,
    source: e.source,
    parties,
    signatures: e.signatures.map(
      ({ signer, digest, signature, certificate, algorithm }) => ({
        signer,
        digest,
        signature,
        ...(certificate
          ? { certificate, algorithm: parseCardAlgorithm(algorithm) }
          : {}),
      }),
    ),
  };
}
export async function prepareEnvelope(envelope: Envelope, fresh = false) {
  const binding = await bindTemplate(
    envelope.source,
    envelope.reference,
    fresh,
  );
  return { ...envelope, reference: binding.reference };
}
export async function portableEnvelope(envelope: Envelope, fresh = false) {
  const { reference, values } = await bindTemplate(
    envelope.source,
    envelope.reference,
    fresh,
  );
  return {
    version: 2 as const,
    reference,
    values,
    id: envelope.id,
    name: envelope.name,
    parties: envelope.parties,
    signatures: envelope.signatures,
  };
}
export async function hydrateEnvelope(value: unknown): Promise<Envelope> {
  const wire = value as Record<string, unknown>;
  if (
    !wire ||
    wire.version !== 2 ||
    'source' in wire ||
    typeof wire.reference !== 'string' ||
    !wire.values ||
    typeof wire.values !== 'object' ||
    Array.isArray(wire.values)
  )
    throw new Error(
      'Expected a reference-only contract package (version 2). Embedded source is not accepted.',
    );
  approvedReference(wire.reference);
  const values = wire.values as Record<string, string>;
  if (
    Object.keys(values).length > 1000 ||
    Object.entries(values).some(
      ([key, value]) =>
        !/^\d+$/.test(key) ||
        typeof value !== 'string' ||
        value.length > MAX_SOURCE_LENGTH,
    )
  )
    throw new Error('Invalid contract variables.');
  const template = await loadTemplate(wire.reference);
  return parseEnvelope({ ...wire, source: populateTemplate(template, values) });
}
export async function shareUrl(envelope: Envelope, origin: string) {
  const data = new TextEncoder().encode(
    JSON.stringify(await portableEnvelope(envelope, true)),
  );
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const base64 = btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  const url = new URL(origin);
  url.search = '?receive=1';
  url.hash = `bundle=${base64}`;
  return url.href;
}
export async function fromShareUrl(hash: string): Promise<Envelope> {
  const value = hash.replace(/^#bundle=/, '');
  if (!/^[\w-]+$/.test(value) || value.length > 400_000)
    throw new Error('Invalid or oversized share link.');
  const bytes = Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    (char) => char.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 600_000) {
      await reader.cancel();
      throw new Error('Contract package is too large.');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return hydrateEnvelope(JSON.parse(new TextDecoder().decode(output)));
}

/** Safe entry point for wallets: reconstruct and validate a portable package before signing. */
export async function signPackage(value: unknown, secret: Uint8Array) {
  return signEnvelope(await hydrateEnvelope(value), secret);
}
