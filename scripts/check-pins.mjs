import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const group of ['dependencies', 'devDependencies'])
  for (const [name, version] of Object.entries(pkg[group])) {
    if (
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ||
      lock.packages['node_modules/' + name]?.version !== version ||
      lock.packages[''][group][name] !== version
    )
      throw new Error(`Unpinned or inconsistent dependency: ${name}`);
  }
for (const [name, entry] of Object.entries(lock.packages))
  if (name && (!entry.version || !entry.integrity))
    throw new Error(`Lockfile integrity missing: ${name}`);
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
for (const match of workflow.matchAll(/uses:\s*([^\s#]+)/g))
  if (!/^[\w/-]+@[a-f0-9]{40}$/.test(match[1]))
    throw new Error(`Unpinned action: ${match[1]}`);
if (!/^\d+\.\d+\.\d+\s*$/.test(readFileSync('.node-version', 'utf8')))
  throw new Error('Node must be pinned.');
console.log(
  'Direct versions, transitive integrity hashes, Actions, and Node are pinned.',
);
