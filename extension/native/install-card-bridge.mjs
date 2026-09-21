#!/usr/bin/env node
// Registers an existing official Web eID binary. Does not download or replace software.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function bridgeManifest(extensionId, executable) {
  if (!/^[a-p]{32}$/.test(extensionId || ''))
    throw new Error(
      'Supply the 32-character Chrome extension ID from chrome://extensions.',
    );
  if (!path.isAbsolute(executable))
    throw new Error('Web eID executable path must be absolute.');
  return {
    name: 'dev.tractate.webeid',
    description: 'Tractate bridge to installed Web eID',
    path: executable,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}
export async function install(args) {
  const [extensionId, ...options] = args;
  bridgeManifest(extensionId, path.resolve('validation-only'));
  const dryRun = options.includes('--dry-run');
  const supplied = options.find((arg) => arg !== '--dry-run');
  const candidates = supplied ? [path.resolve(supplied)] : [];
  let destination;
  if (process.platform === 'darwin') {
    destination = path.join(
      homedir(),
      'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    );
    candidates.push(
      path.join(destination, 'eu.webeid.json'),
      '/Library/Google/Chrome/NativeMessagingHosts/eu.webeid.json',
    );
  } else if (process.platform === 'linux') {
    destination = path.join(
      homedir(),
      '.config/google-chrome/NativeMessagingHosts',
    );
    candidates.push(
      path.join(destination, 'eu.webeid.json'),
      '/etc/opt/chrome/native-messaging-hosts/eu.webeid.json',
      '/etc/chromium/native-messaging-hosts/eu.webeid.json',
    );
  } else if (process.platform === 'win32') {
    destination = path.join(
      process.env.LOCALAPPDATA || path.join(homedir(), 'AppData/Local'),
      'Tractate',
    );
    for (const hive of ['HKCU', 'HKLM']) {
      try {
        const output = execFileSync(
          'reg.exe',
          [
            'query',
            `${hive}\\Software\\Google\\Chrome\\NativeMessagingHosts\\eu.webeid`,
            '/ve',
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        );
        const match = output.match(/REG_SZ\s+([^\r\n]+)/);
        if (match) candidates.push(match[1].trim());
      } catch {
        /* Try the next standard installation location. */
      }
    }
  } else throw new Error('Supported systems: macOS, Linux and Windows.');
  let original;
  for (const candidate of candidates) {
    try {
      const entry = JSON.parse(await readFile(candidate, 'utf8'));
      if (
        entry.name !== 'eu.webeid' ||
        entry.type !== 'stdio' ||
        typeof entry.path !== 'string'
      )
        continue;
      const executable = path.isAbsolute(entry.path)
        ? entry.path
        : path.resolve(path.dirname(candidate), entry.path);
      if (!(await stat(executable)).isFile()) continue;
      original = { path: executable };
      break;
    } catch {
      /* Missing or invalid host manifests cannot be used. */
    }
  }
  if (!original)
    throw new Error(
      'Install official Web eID / ID software first, or supply its eu.webeid.json path as the second argument.',
    );
  const manifest = bridgeManifest(extensionId, original.path);
  const target = path.join(destination, manifest.name + '.json');
  if (dryRun) return { target, manifest, dryRun };
  await mkdir(destination, { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
  if (process.platform === 'win32')
    execFileSync(
      'reg.exe',
      [
        'add',
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\dev.tractate.webeid',
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        target,
        '/f',
      ],
      { stdio: 'pipe' },
    );
  return { target, manifest, dryRun };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  install(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
