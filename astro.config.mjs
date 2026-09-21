import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  build: { inlineStylesheets: 'always' },
  base: process.env.BASE_PATH || '/',
  site: process.env.SITE_URL || 'https://ctzurcanu.github.io',
  integrations: [preact()],
  vite: {
    // MDX entity decoding must use its DOM-free worker export.
    resolve: {
      conditions: ['worker', 'module', 'browser', 'development|production'],
    },
    build: { assetsInlineLimit: 100_000 },
    worker: { format: 'es' },
  },
});
