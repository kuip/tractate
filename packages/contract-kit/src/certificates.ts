import 'reflect-metadata';
import {
  X509Certificate,
  KeyUsagesExtension,
  KeyUsageFlags,
} from '@peculiar/x509';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type CardAlgorithm = {
  cryptoAlgorithm: 'ECC' | 'RSA';
  hashFunction: 'SHA-256' | 'SHA-384' | 'SHA-512';
  paddingScheme: 'NONE' | 'PKCS1.5' | 'PSS';
};
export const certificateTrustNotice =
  'Card signatures verify control of the certificate key. Issuer trust, identity, revocation and qualified-signature status have not been validated.';
export function base64Bytes(value: string) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 32768 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error('Invalid certificate or signature encoding.');
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function toBase64(value: Uint8Array) {
  return btoa(Array.from(value, (b) => String.fromCharCode(b)).join(''));
}
export function signingCertificate(value: string) {
  const bytes = base64Bytes(value);
  const cert = new X509Certificate(bytes);
  const usage = cert.getExtension(KeyUsagesExtension);
  if (!usage || !(usage.usages & KeyUsageFlags.nonRepudiation))
    throw new Error(
      'Use a document-signing certificate, not an authentication certificate.',
    );
  return cert;
}
export function certificateParty(value: string) {
  signingCertificate(value);
  return 'x509:' + bytesToHex(sha256(base64Bytes(value)));
}
export function certificateDetails(value: string) {
  const cert = signingCertificate(value);
  return {
    party: certificateParty(value),
    subject: cert.subject,
    issuer: cert.issuer,
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    identityVerified: false as const,
  };
}
export function assertCurrentCertificate(value: string, now = new Date()) {
  const cert = signingCertificate(value);
  if (now < cert.notBefore || now > cert.notAfter)
    throw new Error('The card signing certificate is not currently valid.');
}
export function parseCardAlgorithm(value: unknown): CardAlgorithm {
  const a = value as CardAlgorithm;
  if (
    !a ||
    !['SHA-256', 'SHA-384', 'SHA-512'].includes(a.hashFunction) ||
    !(
      (a.cryptoAlgorithm === 'ECC' && a.paddingScheme === 'NONE') ||
      (a.cryptoAlgorithm === 'RSA' &&
        ['PKCS1.5', 'PSS'].includes(a.paddingScheme))
    )
  )
    throw new Error('Unsupported card signature algorithm.');
  return {
    cryptoAlgorithm: a.cryptoAlgorithm,
    hashFunction: a.hashFunction,
    paddingScheme: a.paddingScheme,
  };
}
export async function verifyCertificateSignature(
  certificate: string,
  algorithm: CardAlgorithm,
  signature: Uint8Array,
  payload: Uint8Array,
) {
  const a = parseCardAlgorithm(algorithm);
  const cert = signingCertificate(certificate);
  const keyAlgorithm = cert.publicKey.algorithm as EcKeyImportParams &
    RsaHashedImportParams;
  let key: CryptoKey;
  let operation: Algorithm | EcdsaParams | RsaPssParams;
  if (a.cryptoAlgorithm === 'ECC') {
    if (
      keyAlgorithm.name !== 'ECDSA' ||
      !['P-256', 'P-384', 'P-521'].includes(keyAlgorithm.namedCurve)
    )
      return false;
    key = await cert.publicKey.export(
      { name: 'ECDSA', namedCurve: keyAlgorithm.namedCurve },
      ['verify'],
    );
    operation = { name: 'ECDSA', hash: a.hashFunction };
  } else {
    if (!keyAlgorithm.name.startsWith('RSA')) return false;
    const name = a.paddingScheme === 'PSS' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5';
    key = await cert.publicKey.export({ name, hash: a.hashFunction }, [
      'verify',
    ]);
    if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) return false;
    operation =
      name === 'RSA-PSS'
        ? { name, saltLength: Number(a.hashFunction.slice(4)) / 8 }
        : { name };
  }
  // Web eID returns fixed-width r||s for ECDSA, also used by WebCrypto.
  return crypto.subtle.verify(
    operation,
    key,
    new Uint8Array(signature),
    new Uint8Array(payload),
  );
}
