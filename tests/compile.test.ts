import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSource } from '../src/lib/compile';
import { readFileSync } from 'node:fs';
import { compileDocument } from '../src/lib/compile';
import { applyFieldEdit } from '../src/lib/fields';
const example = readFileSync(
  new URL('../contracts/agreements/contribution.mdx', import.meta.url),
  'utf8',
);

test('the sample and GFM tables compile', async () => {
  assert.match(await compileSource(example), /Contribution agreement/);
  assert.match(await compileSource('| a | b |\n| - | - |\n| 1 | 2 |'), /table/);
});
test('untrusted MDX cannot execute expressions, import code, inject HTML, or use dynamic attributes', async () => {
  for (const source of [
    '<MenuItem label="Bad" href="javascript:alert(1)" />',
    '{alert(1)}',
    'import x from "https://example.com/x.js"',
    '<script>alert(1)</script>',
    '<Callout title={alert(1)} />',
    '<Callout {...props} />',
    '<Field onclick="alert(1)" />',
    '<iframe src="https://example.com" />',
    '[bad](javascript:alert%281%29)',
    '![remote](https://example.com/a.png)',
  ]) {
    await assert.rejects(compileSource(source), source);
  }
});
test('invalid and oversized documents fail without preventing later valid compilation', async () => {
  await assert.rejects(compileSource('<Callout>'));
  await assert.rejects(compileSource('x'.repeat(100_001)));
  assert.match(await compileSource('# Recovered'), /Recovered/);
});

test('output edits patch only the intended field and retain valid MDX', async () => {
  const source =
    '<Field label="First" value="one" />\n<Field label="Second" value="two" />';
  const compiled = await compileDocument(source);
  const first = applyFieldEdit(
    source,
    compiled.fields,
    '0',
    'Alice "A" & <script>',
  );
  assert.ok(first);
  const second = applyFieldEdit(first.source, first.fields, '1', 'Bob');
  assert.ok(second);
  assert.match(
    second.source,
    /value="Alice &quot;A&quot; &amp; &lt;script&gt;"/,
  );
  assert.match(second.source, /label="Second" value="Bob"/);
  assert.equal((await compileDocument(second.source)).fields.length, 2);
});

test('MDX imports expose only declared wallet/proof components, without arbitrary module execution', async () => {
  const imported =
    'import { ContractSign, ContractProof } from \'@tractate/contract-kit/mdx\';\n\n<ContractSign label="Sign" />\n<ContractProof />';
  const result = await compileSource(imported);
  assert.match(result, /ContractSign/);
  assert.doesNotMatch(result, /await import|import\(/);
  for (const source of [
    "import { signEnvelope } from '@tractate/contract-kit/mdx';\n\n# Bad",
    "import { ContractSign as Sign } from '@tractate/contract-kit/mdx';\n\n<Sign />",
    "import * as kit from '@tractate/contract-kit/mdx';\n\n# Bad",
    "import { ContractSign } from '@tractate/contract-kit/mdx'; export const x = alert(1);\n\n<ContractSign />",
    '<ContractSign />',
    '<Field label="A" value="one" value="two" />',
  ])
    await assert.rejects(compileSource(source));
});
