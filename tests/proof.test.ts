import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reference, template, mockTemplates } from './template-fixtures';
import {
  nativeParty,
  parseParties,
  signEnvelope,
  portableEnvelope,
  type Envelope,
} from '../packages/contract-kit/src/envelope';
import {
  createSigningProof,
  verifySigningProof,
  mergeSignedPackages,
  verifyPackage,
} from '../packages/contract-kit/src/proof';
import {
  reviewContract,
  reviewChanges,
} from '../packages/contract-kit/src/review';
import { allowedSite, walletRequest } from '../extension/src/policy';
mockTemplates();
const alice = new Uint8Array(32).fill(17),
  bob = new Uint8Array(32).fill(34);
const base: Envelope = {
  version: 2,
  reference,
  id: 'proof-test',
  name: 'agreement',
  source: template,
  parties: parseParties(`${nativeParty(alice)} ${nativeParty(bob)}`),
  signatures: [],
};
test('independent signatures merge into a proof verified by every party; tampering fails', async () => {
  const partial = async (key: Uint8Array) =>
    portableEnvelope({ ...base, signatures: [signEnvelope(base, key)] });
  const merged = await mergeSignedPackages([
    await partial(alice),
    await partial(bob),
  ]);
  const verified = await verifyPackage(merged);
  assert.equal(verified.complete, true);
  const proof = await createSigningProof(verified.envelope);
  assert.equal('source' in proof.contract, false);
  assert.equal(
    (await verifySigningProof(proof)).packageHash,
    verified.packageHash,
  );
  await assert.rejects(
    verifySigningProof({ ...proof, packageHash: '00'.repeat(32) }),
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
  await assert.rejects(
    verifySigningProof({
      ...proof,
      contract: {
        ...proof.contract,
        signatures: proof.contract.signatures.slice(1),
      },
    }),
  );
  await assert.rejects(
    mergeSignedPackages([
      await partial(alice),
      { ...(await partial(bob)), id: 'different' },
    ]),
    /different contract versions/,
  );
});
test('review covers inactive-tab fields and party/value/template changes', async () => {
  const before = await reviewContract(base);
  const after = await reviewContract({
    ...base,
    source: template.replace('value=""', 'value="Changed"'),
    parties: [nativeParty(alice)],
  });
  assert.equal(before.fields.length, 3);
  assert.equal(before.fields[0].label, 'Author');
  assert.ok(
    reviewChanges(after, before).some((change) => change.includes('Changed')),
  );
  assert.ok(
    reviewChanges(after, before).some((change) =>
      change.includes('Removed party'),
    ),
  );
  assert.equal(
    reviewChanges(before, before)[0],
    'No changes since your previous signature.',
  );
  const tabs = await reviewContract({
    ...base,
    source:
      '<Tabs><Tab label="One"><Field label="Visible" value="A" /></Tab><Tab label="Two"><Field label="Hidden" value="B" /></Tab></Tabs>',
  });
  assert.deepEqual(
    tabs.fields.map((field) => field.label),
    ['Visible', 'Hidden'],
  );
});
test('wallet accepts only explicitly allowed origins, methods and bounded reference packages', () => {
  assert.ok(allowedSite('https://kuip.github.io/tractate/'));
  assert.ok(allowedSite('http://localhost:4321/'));
  for (const url of [
    'https://kuip.github.io/other/',
    'https://kuip.github.io.evil/tractate/',
    'http://kuip.github.io/tractate/',
    'https://evil.test',
    'http://localhost:1234',
    'null',
  ])
    assert.equal(allowedSite(url), false);
  const request = {
    channel: 'tractate:wallet:request',
    id: '12345678-1234-1234-1234-123456789abc',
    method: 'connect',
  };
  assert.equal(walletRequest(request).method, 'connect');
  assert.throws(() => walletRequest({ ...request, method: 'unlock' }));
  assert.throws(() =>
    walletRequest({
      ...request,
      method: 'sign',
      contract: { version: 2, source: 'code' },
    }),
  );
  assert.throws(() =>
    walletRequest({ ...request, padding: 'x'.repeat(600001) }),
  );
});
