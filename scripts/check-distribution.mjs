import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as kit from '../packages/contract-kit/dist/index.js';
const entry = kit.approvedTemplates[0];
const source = await readFile(entry.reference.slice(41), 'utf8');
const original = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), kit.repositoryPrefix + entry.reference);
  return new Response(source);
};
try {
  const secret = new Uint8Array(32).fill(17);
  const envelope = {
    version: 2,
    reference: entry.reference,
    id: 'distribution-test',
    name: 'test',
    source,
    parties: [kit.nativeParty(secret)],
    signatures: [],
  };
  const wire = await kit.portableEnvelope(envelope);
  wire.signatures.push(await kit.signPackage(wire, secret));
  const verified = await kit.verifyPackage(wire);
  assert.equal(verified.complete, true);
  const proof = await kit.createSigningProof(verified.envelope);
  assert.equal((await kit.verifySigningProof(proof)).complete, true);
  console.log(
    'Built public ESM library signs and independently verifies portable proofs.',
  );
} finally {
  globalThis.fetch = original;
}
