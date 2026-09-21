import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { MAX_SOURCE_LENGTH } from './example';

export type Attestation = { signer: string; digest: string; signature: string };
export type Envelope = {
  version: 1;
  id: string;
  name: string;
  source: string;
  parties: string[];
  signatures: Attestation[];
};
// A Tractate-native signing format for Kayros, independent of any other chain.
export const signingDomain = 'tractate:kayros:contract-consent:v1';
export function signingBytes(envelope: Envelope) {
  return new TextEncoder().encode(
    JSON.stringify({
      domain: signingDomain,
      version: envelope.version,
      id: envelope.id,
      name: envelope.name,
      source: envelope.source,
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
  const signer = nativeParty(secret);
  if (!envelope.parties.includes(signer))
    throw new Error('This wallet is not a required party.');
  return {
    signer,
    digest: digest(envelope),
    signature: bytesToHex(ed25519.sign(signingBytes(envelope), secret)),
  };
}
export function validAttestations(envelope: Envelope): Attestation[] {
  const hash = digest(envelope);
  const payload = signingBytes(envelope);
  const seen = new Set<string>();
  return envelope.signatures.filter((record) => {
    try {
      if (
        seen.has(record.signer) ||
        !envelope.parties.includes(record.signer) ||
        record.digest !== hash ||
        !ed25519.verify(
          hexToBytes(record.signature),
          payload,
          hexToBytes(record.signer.slice(8)),
          { zip215: false },
        )
      )
        return false;
      seen.add(record.signer);
      return true;
    } catch {
      return false;
    }
  });
}
export function verifiedSigners(envelope: Envelope): string[] {
  return validAttestations(envelope).map((record) => record.signer);
}
export function canRegister(envelope: Envelope) {
  return (
    envelope.parties.length > 0 &&
    verifiedSigners(envelope).length === envelope.parties.length
  );
}
export function parseParties(value: string) {
  const items = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  if (
    items.length > 20 ||
    items.some((item) => !/^ed25519:[a-f0-9]{64}$/.test(item))
  )
    throw new Error(
      'Enter up to 20 native public keys, one per party (ed25519: followed by 64 hex digits).',
    );
  if (new Set(items).size !== items.length)
    throw new Error('Each party must have a different public key.');
  return items.sort();
}
export function parseEnvelope(value: unknown): Envelope {
  const e = value as Envelope;
  if (
    !e ||
    e.version !== 1 ||
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
  if (e.parties.some((party) => typeof party !== 'string'))
    throw new Error('Invalid party list.');
  const parties = parseParties(e.parties.join('\n'));
  if (JSON.stringify(parties) !== JSON.stringify(e.parties))
    throw new Error('Party addresses must be normalized and sorted.');
  for (const record of e.signatures) {
    if (
      !record ||
      typeof record.signer !== 'string' ||
      !/^ed25519:[a-f0-9]{64}$/.test(record.signer) ||
      typeof record.digest !== 'string' ||
      !/^[\da-f]{64}$/i.test(record.digest) ||
      typeof record.signature !== 'string' ||
      !/^[\da-f]{128}$/i.test(record.signature)
    )
      throw new Error('Invalid signature record.');
  }
  return {
    version: 1,
    id: e.id,
    name: e.name,
    source: e.source,
    parties,
    signatures: e.signatures.map(({ signer, digest, signature }) => ({
      signer,
      digest,
      signature,
    })),
  };
}
export async function shareUrl(envelope: Envelope, origin: string) {
  const data = new TextEncoder().encode(JSON.stringify(envelope));
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
  return parseEnvelope(JSON.parse(new TextDecoder().decode(output)));
}
