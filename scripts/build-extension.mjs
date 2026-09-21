import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
await mkdir('extension/dist', { recursive: true });
await build({
  entryPoints: {
    wallet: 'extension/src/wallet.tsx',
    background: 'extension/src/background.ts',
    content: 'extension/src/content.ts',
  },
  bundle: true,
  outdir: 'extension/dist',
  format: 'esm',
  platform: 'browser',
  conditions: ['worker'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  target: 'chrome120',
});
for (const file of ['manifest.json', 'wallet.html'])
  await copyFile('extension/' + file, 'extension/dist/' + file);
console.log('Load extension/dist as an unpacked Chrome extension.');

await mkdir('public/downloads', { recursive: true });
await copyFile(
  'extension/native/install-card-bridge.mjs',
  'public/downloads/install-card-bridge.mjs',
);
await rm('public/downloads/tractate-wallet.zip', { force: true });
execFileSync(
  'zip',
  [
    '-q',
    path.resolve('public/downloads/tractate-wallet.zip'),
    'manifest.json',
    'wallet.html',
    'wallet.js',
    'wallet.css',
    'background.js',
    'content.js',
  ],
  { cwd: 'extension/dist' },
);
