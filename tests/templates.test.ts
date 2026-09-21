import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { mockTemplates, reference, template } from './template-fixtures';
import {
  approvedReference,
  bindTemplate,
  loadTemplate,
} from '../src/lib/templates';
import {
  hydrateEnvelope,
  portableEnvelope,
  shareUrl,
  type Envelope,
} from '../src/lib/envelope';
mockTemplates();
const envelope: Envelope = {
  version: 2,
  reference,
  id: 'portable-test',
  name: 'agreement',
  source: template.replace(
    'value=""',
    'value="Alice &amp; Bob &quot;quoted&quot;"',
  ),
  parties: [],
  signatures: [],
};
test('wire packages and links contain only a pinned reference and values, never source', async () => {
  const portable = await portableEnvelope(envelope);
  assert.equal('source' in portable, false);
  assert.equal(portable.reference, reference);
  assert.equal(portable.values['0'], 'Alice & Bob "quoted"');
  const link = new URL(
    await shareUrl(envelope, 'https://kuip.github.io/tractate/'),
  );
  assert.equal(link.pathname, '/tractate/');
  const wire = JSON.parse(
    gunzipSync(Buffer.from(link.hash.slice(8), 'base64url')).toString(),
  );
  assert.deepEqual(wire, portable);
  assert.deepEqual(await hydrateEnvelope(wire), envelope);
  await assert.rejects(
    hydrateEnvelope({ ...portable, source: template }),
    /Embedded source/,
  );
  await assert.rejects(
    hydrateEnvelope({
      ...portable,
      values: { ...portable.values, '999': 'extra' },
    }),
    /fields/,
  );
});
test('approval rejects mutable revisions, foreign URLs, traversal, unknown commits and code changes', async () => {
  for (const bad of [
    reference.replace(/^[^/]+/, 'main'),
    'https://example.com/' + reference,
    reference.replace('agreements', '..'),
    reference.replace(/^./, '0'),
  ])
    assert.throws(() => approvedReference(bad));
  await assert.rejects(
    bindTemplate(template.replace('## Terms', '## Changed terms'), reference),
    /Only field values/,
  );
});
test('fresh GitHub fetch must succeed and match the approved content hash', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('changed source');
    await assert.rejects(loadTemplate(reference, true), /content hash/);
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(loadTemplate(reference, true), /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
