import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else if (item.name !== 'sw.js') files.push(full.replace(/^dist\//, ''));
  }
}
await walk('dist');
const hash = createHash('sha256');
for (const file of files.sort()) hash.update(await readFile(`dist/${file}`));
const version = hash.digest('hex').slice(0, 12);
const urls = [...new Set([base, ...files.map((file) => base + file)])];
const prefix = `tractate:${base}:`;
await writeFile(
  'dist/sw.js',
  `const CACHE=${JSON.stringify(prefix + version)},PREFIX=${JSON.stringify(prefix)},ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data==='activate')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request,{ignoreVary:true,ignoreSearch:true}))||fetch(event.request)));});
`,
);
console.log(`Offline cache: ${urls.length} assets, version ${version}`);
