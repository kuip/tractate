import { reference, template } from './template-fixtures';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeystore,
  parseKeystore,
  signWithKeystore,
  unlockKeystore,
} from '../src/lib/native-wallet';
import { canRegister, type Envelope } from '../src/lib/envelope';
test('native wallet encrypts, restores and signs; wrong passwords and tampering fail', async () => {
  const wallet = await createKeystore('test-only password 123');
  assert.equal(wallet.ciphertext.length, 96);
  assert.equal(wallet.publicKey.startsWith('ed25519:'), true);
  const restored = parseKeystore(JSON.parse(JSON.stringify(wallet)));
  const envelope: Envelope = {
    version: 2,
    reference,
    id: 'wallet-test',
    source: template,
    name: 'test',
    parties: [wallet.publicKey],
    signatures: [],
  };
  const signature = await signWithKeystore(
    envelope,
    restored,
    'test-only password 123',
  );
  assert.equal(
    await canRegister({ ...envelope, signatures: [signature] }),
    true,
  );
  await assert.rejects(
    unlockKeystore(restored, 'wrong password'),
    /Wrong password/,
  );
  await assert.rejects(
    unlockKeystore(
      { ...restored, ciphertext: '00'.repeat(48) },
      'test-only password 123',
    ),
  );
  assert.throws(() => parseKeystore({ ...restored, iterations: 1 }));
  await assert.rejects(createKeystore('short'));
});
