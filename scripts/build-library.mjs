import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { mkdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await build({
  entryPoints: [
    'packages/contract-kit/src/index.ts',
    'packages/contract-kit/src/mdx.tsx',
  ],
  bundle: true,
  outdir: 'packages/contract-kit/dist',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['worker', 'module'],
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  external: ['preact', 'preact/*'],
  minify: true,
  target: 'es2022',
});
execFileSync(
  'node_modules/.bin/tsc',
  ['-p', 'packages/contract-kit/tsconfig.json'],
  { stdio: 'inherit' },
);
await copyFile('LICENSE', 'packages/contract-kit/LICENSE');
await mkdir('public/lib', { recursive: true });
await copyFile(
  'packages/contract-kit/dist/index.js',
  'public/lib/contract-kit.js',
);

const packCache = await mkdtemp(path.join(tmpdir(), 'tractate-pack-'));
try {
  execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', '../../public/lib'],
    {
      cwd: 'packages/contract-kit',
      stdio: 'pipe',
      env: { ...process.env, npm_config_cache: packCache },
    },
  );
} finally {
  await rm(packCache, { recursive: true, force: true });
}
