import {
  assertCurrentCertificate,
  base64Bytes,
  certificateParty,
  parseCardAlgorithm,
  toBase64,
  type CardAlgorithm,
} from '../../packages/contract-kit/src/certificates';
import {
  digest,
  signingBytes,
  verifiedSigners,
  type Attestation,
  type Envelope,
} from '../../packages/contract-kit/src/envelope';
import { bytesToHex } from '@noble/hashes/utils.js';

export type Card = {
  certificate: string;
  algorithms: CardAlgorithm[];
  publicKey: string;
};
// The installer registers the existing Web eID binary for this extension ID only.
export const cardHost = 'dev.tractate.webeid';
export function cardCommand(
  command: 'get-signing-certificate' | 'sign',
  origin: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const site = new URL(origin);
  if (site.protocol !== 'https:')
    throw new Error('Card signing requires opening Tractate over HTTPS.');
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(cardHost);
    let settled = false;
    let sent = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      port.disconnect();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error('Card request expired. Try again.')),
      240000,
    );
    port.onDisconnect.addListener(() => {
      const message = chrome.runtime.lastError?.message;
      finish(
        new Error(
          message
            ? `Web eID is unavailable: ${message}. Install ID software and run the card bridge setup shown below.`
            : 'The card application closed without completing the request.',
        ),
      );
    });
    port.onMessage.addListener((message: any) => {
      if (!sent && typeof message?.version === 'string') {
        sent = true;
        port.postMessage({
          command,
          arguments: { ...args, origin: site.origin },
        });
      } else if (message?.error) {
        finish(
          new Error(
            message.error.message ||
              message.error.code ||
              'Card operation failed.',
          ),
        );
      } else if (sent) {
        finish(undefined, message);
      } else {
        finish(new Error('Unexpected Web eID response.'));
      }
    });
  });
}
export async function readCard(origin: string): Promise<Card> {
  const result = await cardCommand('get-signing-certificate', origin);
  assertCurrentCertificate(result.certificate);
  if (!Array.isArray(result.supportedSignatureAlgorithms))
    throw new Error('Card did not report signing algorithms.');
  const algorithms: CardAlgorithm[] = [];
  for (const algorithm of result.supportedSignatureAlgorithms) {
    try {
      algorithms.push(parseCardAlgorithm(algorithm));
    } catch {
      /* Unsupported algorithms are never selected. */
    }
  }
  if (!algorithms.length)
    throw new Error('This card has no supported SHA-2 signing algorithm.');
  return {
    certificate: result.certificate,
    publicKey: certificateParty(result.certificate),
    algorithms,
  };
}
export async function signWithCard(
  envelope: Envelope,
  card: Card,
  origin: string,
): Promise<Attestation> {
  if (!envelope.parties.includes(card.publicKey))
    throw new Error('This card is not a required party.');
  assertCurrentCertificate(card.certificate);
  const algorithm =
    card.algorithms.find((a) => a.hashFunction === 'SHA-384') ||
    card.algorithms[0];
  if (!algorithm) throw new Error('Read the card before signing.');
  const hash = await crypto.subtle.digest(
    algorithm.hashFunction,
    signingBytes(envelope),
  );
  const result = await cardCommand('sign', origin, {
    certificate: card.certificate,
    hash: toBase64(new Uint8Array(hash)),
    hashFunction: algorithm.hashFunction,
  });
  const actual = parseCardAlgorithm(result.signatureAlgorithm);
  if (
    actual.hashFunction !== algorithm.hashFunction ||
    !card.algorithms.some((a) => JSON.stringify(a) === JSON.stringify(actual))
  )
    throw new Error('The card returned an unexpected signature algorithm.');
  const attestation: Attestation = {
    signer: card.publicKey,
    digest: digest(envelope),
    certificate: card.certificate,
    algorithm: actual,
    signature: bytesToHex(base64Bytes(result.signature)),
  };
  if (
    !(
      await verifiedSigners({ ...envelope, signatures: [attestation] })
    ).includes(card.publicKey)
  )
    throw new Error('The card signature could not be verified.');
  return attestation;
}
