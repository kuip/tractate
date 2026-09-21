import { reference, template, mockTemplates } from './template-fixtures';
mockTemplates();
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeParty, signEnvelope } from '../src/lib/envelope';
import {
  canRegister,
  fromShareUrl,
  parseEnvelope,
  parseParties,
  shareUrl,
  verifiedSigners,
  type Envelope,
} from '../src/lib/envelope';
import { registrationPayload } from '../src/lib/kayros';
const alice = new Uint8Array(32).fill(17);
const bob = new Uint8Array(32).fill(34);
const fresh = (): Envelope => ({
  version: 2,
  reference,
  id: 'test-contract',
  name: 'agreement',
  source: template.replace('value=""', 'value="42"'),
  parties: parseParties(`${nativeParty(alice)}\n${nativeParty(bob)}`),
  signatures: [],
});
const signed = async (envelope: Envelope, wallet: Uint8Array) => ({
  ...envelope,
  signatures: [...envelope.signatures, signEnvelope(envelope, wallet)],
});
test('registration requires distinct valid signatures over the exact contract and party list', async () => {
  const base = fresh();
  assert.equal(canRegister(base), false);
  const one = await signed(base, alice);
  assert.equal(canRegister(one), false);
  const both = await signed(one, bob);
  assert.equal(canRegister(both), true);
  assert.equal(
    canRegister({ ...both, source: base.source.replace('42', '43') }),
    false,
  );
  assert.equal(canRegister({ ...both, parties: [nativeParty(alice)] }), false);
  assert.equal(
    canRegister({
      ...both,
      signatures: [both.signatures[0], both.signatures[0]],
    }),
    false,
  );
  assert.equal(canRegister({ ...base, parties: [] }), false);
  assert.throws(() => registrationPayload(one, 'tractate_v1'));
  assert.match(
    registrationPayload(both, 'tractate_v1').data_item,
    /^[a-f0-9]{64}$/,
  );
});
test('share link round-trips values and signatures and ignores forged attestations', async () => {
  const envelope = await signed(await signed(fresh(), alice), bob);
  const url = await shareUrl(envelope, 'http://localhost:4321/?contract=old');
  assert.equal(new URL(url).search, '?receive=1');
  const restored = await fromShareUrl(new URL(url).hash);
  assert.deepEqual(restored, envelope);
  assert.equal(canRegister(restored), true);
  const forged = {
    ...envelope.signatures[0],
    signature: '00'.repeat(64),
  };
  const noisy = { ...envelope, signatures: [forged, ...envelope.signatures] };
  assert.equal(verifiedSigners(noisy).length, 2);
  assert.deepEqual(
    registrationPayload(noisy, 'tractate_v1'),
    registrationPayload(envelope, 'tractate_v1'),
  );
  assert.throws(() => parseEnvelope({ ...envelope, parties: ['nobody'] }));
  assert.throws(() =>
    parseParties(`${nativeParty(alice)},${nativeParty(alice)}`),
  );
  await assert.rejects(fromShareUrl('#bundle=invalid'));
});
