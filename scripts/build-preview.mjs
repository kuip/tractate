import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

// A self-contained document avoids CORS and offline access problems in an
// opaque-origin sandbox. It also keeps Vite's development scripts out of it.
const runtime = await build({
  entryPoints: ['src/lib/preview.tsx'],
  bundle: true,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  write: false,
});
const styles = await build({
  entryPoints: ['src/styles/preview.css'],
  bundle: true,
  minify: true,
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  write: false,
});
await mkdir('public', { recursive: true });
await writeFile(
  'public/preview.html',
  `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'">
<title>Contract output</title><style>${styles.outputFiles[0].text}</style></head>
<body><main id="document" aria-label="Rendered contract"></main><script>${runtime.outputFiles[0].text}</script></body></html>`,
);
