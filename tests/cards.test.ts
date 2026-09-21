import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyUsageFlags } from '@peculiar/x509';
import { cardFixture } from './card-fixtures';
import { reference, template, mockTemplates } from './template-fixtures';
import {
  assertCurrentCertificate,
  certificateParty,
  certificateDetails,
} from '../packages/contract-kit/src/certificates';
import {
  nativeParty,
  parseEnvelope,
  parseParties,
  signEnvelope,
  verifiedSigners,
  portableEnvelope,
  type Envelope,
} from '../packages/contract-kit/src/envelope';
import {
  createSigningProof,
  mergeSignedPackages,
  verifySigningProof,
} from '../packages/contract-kit/src/proof';
import { bridgeManifest } from '../extension/native/install-card-bridge.mjs';
mockTemplates();
for (const [algorithm, curve] of [
  ['ECDSA', 'P-256'],
  ['ECDSA', 'P-384'],
  ['ECDSA', 'P-521'],
  ['RSA', ''],
]) {
  test(`${algorithm} ${curve}: mixed card/wallet proof round-trip and tampering`, async () => {
    const card = await cardFixture(algorithm, curve);
    const secret = new Uint8Array(32).fill(17);
    const envelope: Envelope = {
      version: 2,
      reference,
      id: 'card-test',
      name: 'test',
      source: template,
      parties: parseParties(`${nativeParty(secret)} ${card.publicKey}`),
      signatures: [],
    };
    const cardSignature = await card.sign(envelope);
    const walletSignature = signEnvelope(envelope, secret);
    const merged = await mergeSignedPackages([
      await portableEnvelope({ ...envelope, signatures: [cardSignature] }),
      await portableEnvelope({ ...envelope, signatures: [walletSignature] }),
    ]);
    const signed = parseEnvelope({
      ...envelope,
      signatures: merged.signatures,
    });
    assert.deepEqual((await verifiedSigners(signed)).sort(), envelope.parties);
    const proof = await createSigningProof(signed);
    const result = await verifySigningProof(JSON.parse(JSON.stringify(proof)));
    assert.equal(result.complete, true);
    assert.equal(result.identityVerified, false);
    assert.equal(certificateDetails(card.certificate).identityVerified, false);
    assert.deepEqual(await verifiedSigners({ ...signed, name: 'changed' }), []);
    assert.deepEqual(
      await verifiedSigners({
        ...envelope,
        signatures: [{ ...cardSignature, signature: '00'.repeat(64) }],
      }),
      [],
    );
    assert.deepEqual(
      await verifiedSigners({
        ...envelope,
        signatures: [
          {
            ...cardSignature,
            algorithm: { ...card.algorithm, hashFunction: 'SHA-256' },
          },
        ],
      }),
      [],
    );
    const wrongCard = await cardFixture();
    assert.deepEqual(
      await verifiedSigners({
        ...envelope,
        signatures: [{ ...cardSignature, certificate: wrongCard.certificate }],
      }),
      [],
    );
    assert.throws(() =>
      parseEnvelope({
        ...envelope,
        signatures: [{ ...cardSignature, certificate: wrongCard.certificate }],
      }),
    );
    await assert.rejects(
      verifySigningProof({
        ...proof,
        contract: {
          ...proof.contract,
          values: { ...proof.contract.values, '0': 'changed' },
        },
      }),
    );
  });
}
test('authentication certificates, malformed encodings, expired and future certificates are rejected for signing', async () => {
  const authentication = await cardFixture(
    'ECDSA',
    'P-384',
    KeyUsageFlags.digitalSignature,
  );
  assert.throws(
    () => certificateParty(authentication.certificate),
    /document-signing/,
  );
  assert.throws(() => certificateParty('not a certificate'));
  const card = await cardFixture();
  assertCurrentCertificate(card.certificate);
  assert.throws(
    () => assertCurrentCertificate(card.certificate, new Date('2050-01-01')),
    /not currently valid/,
  );
  assert.throws(
    () => assertCurrentCertificate(card.certificate, new Date('2010-01-01')),
    /not currently valid/,
  );
});
test('bridge manifest grants native access only to the specified extension', () => {
  const executable =
    process.platform === 'win32' ? 'C:\\WebEID\\web-eid.exe' : '/opt/web-eid';
  assert.deepEqual(bridgeManifest('a'.repeat(32), executable).allowed_origins, [
    `chrome-extension://${'a'.repeat(32)}/`,
  ]);
  assert.throws(() => bridgeManifest('*', executable));
  assert.throws(() => bridgeManifest('a'.repeat(32), 'relative-executable'));
});
test('RSA-PSS proofs verify with hash-length salt and reject algorithm substitution', async () => {
  const card = await cardFixture('RSA');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    await crypto.subtle.exportKey('pkcs8', card.keys.privateKey),
    { name: 'RSA-PSS', hash: 'SHA-384' },
    false,
    ['sign'],
  );
  const envelope: Envelope = {
    version: 2,
    reference,
    id: 'pss-test',
    name: 'test',
    source: template,
    parties: [card.publicKey],
    signatures: [],
  };
  const { signingBytes, digest } =
    await import('../packages/contract-kit/src/envelope');
  const { bytesToHex } = await import('@noble/hashes/utils.js');
  const record = {
    signer: card.publicKey,
    digest: digest(envelope),
    certificate: card.certificate,
    algorithm: { ...card.algorithm, paddingScheme: 'PSS' as const },
    signature: bytesToHex(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'RSA-PSS', saltLength: 48 },
          key,
          signingBytes(envelope),
        ),
      ),
    ),
  };
  assert.deepEqual(
    await verifiedSigners({ ...envelope, signatures: [record] }),
    [card.publicKey],
  );
  assert.deepEqual(
    await verifiedSigners({
      ...envelope,
      signatures: [{ ...record, algorithm: card.algorithm }],
    }),
    [],
  );
});
