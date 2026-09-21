import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const entries = JSON.parse(
  await readFile(
    new URL('../contracts/approved.json', import.meta.url),
    'utf8',
  ),
);
for (const { reference, sha256 } of entries) {
  if (!/^[a-f0-9]{40}\/contracts\/(?:[\w-]+\/)*[\w-]+\.mdx$/.test(reference))
    throw new Error(`Invalid reference: ${reference}`);
  const response = await fetch(
    'https://raw.githubusercontent.com/kuip/tractate/' + reference,
    { redirect: 'error', signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error(`Missing GitHub contract: ${reference}`);
  if (
    createHash('sha256')
      .update(Buffer.from(await response.arrayBuffer()))
      .digest('hex') !== sha256
  )
    throw new Error(`Hash mismatch: ${reference}`);
  console.log(`Verified ${reference}`);
}
