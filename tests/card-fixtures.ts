import 'reflect-metadata';
import {
  X509CertificateGenerator,
  KeyUsagesExtension,
  KeyUsageFlags,
} from '@peculiar/x509';
import {
  certificateParty,
  type CardAlgorithm,
} from '../packages/contract-kit/src/certificates';
import {
  digest,
  signingBytes,
  type Envelope,
  type Attestation,
} from '../packages/contract-kit/src/envelope';
import { bytesToHex } from '@noble/hashes/utils.js';
export async function cardFixture(
  name = 'ECDSA',
  curve = 'P-384',
  usage = KeyUsageFlags.nonRepudiation,
) {
  const algorithm =
    name === 'ECDSA'
      ? { name, namedCurve: curve, hash: 'SHA-384' }
      : {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-384',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
        };
  const keys = (await crypto.subtle.generateKey(algorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const cert = await X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=TEST ONLY,C=EE',
    keys,
    notBefore: new Date('2020-01-01'),
    notAfter: new Date('2040-01-01'),
    signingAlgorithm: algorithm,
    extensions: [new KeyUsagesExtension(usage, true)],
  });
  const certificate = cert.toString('base64');
  const cardAlgorithm: CardAlgorithm = {
    cryptoAlgorithm: name === 'ECDSA' ? 'ECC' : 'RSA',
    hashFunction: 'SHA-384',
    paddingScheme: name === 'ECDSA' ? 'NONE' : 'PKCS1.5',
  };
  return {
    keys,
    certificate,
    algorithm: cardAlgorithm,
    publicKey:
      usage === KeyUsageFlags.nonRepudiation
        ? certificateParty(certificate)
        : '',
    async sign(envelope: Envelope): Promise<Attestation> {
      return {
        signer: certificateParty(certificate),
        digest: digest(envelope),
        certificate,
        algorithm: cardAlgorithm,
        signature: bytesToHex(
          new Uint8Array(
            await crypto.subtle.sign(
              algorithm,
              keys.privateKey,
              signingBytes(envelope),
            ),
          ),
        ),
      };
    },
  };
}
