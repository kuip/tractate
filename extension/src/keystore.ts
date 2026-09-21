import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import {
  nativeParty,
  signEnvelope,
  type Envelope,
} from '../../packages/contract-kit/src/envelope';
export type Keystore = {
  version: 1;
  algorithm: 'Ed25519';
  kdf: 'PBKDF2-SHA256';
  iterations: 600000;
  cipher: 'AES-256-GCM';
  publicKey: string;
  salt: string;
  iv: string;
  ciphertext: string;
};
function requireCrypto() {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Native wallet encryption needs HTTPS or localhost. Open this app through HTTPS to sign from another device.',
    );
}
async function encryptionKey(password: string, salt: Uint8Array) {
  requireCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(salt),
      iterations: 600000,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export function parseKeystore(value: unknown): Keystore {
  const k = value as Keystore;
  if (
    !k ||
    k.version !== 1 ||
    k.algorithm !== 'Ed25519' ||
    k.kdf !== 'PBKDF2-SHA256' ||
    k.iterations !== 600000 ||
    k.cipher !== 'AES-256-GCM' ||
    typeof k.publicKey !== 'string' ||
    !/^ed25519:[a-f0-9]{64}$/.test(k.publicKey) ||
    typeof k.salt !== 'string' ||
    !/^[a-f0-9]{32}$/.test(k.salt) ||
    typeof k.iv !== 'string' ||
    !/^[a-f0-9]{24}$/.test(k.iv) ||
    typeof k.ciphertext !== 'string' ||
    !/^[a-f0-9]{96}$/.test(k.ciphertext)
  )
    throw new Error('Invalid native wallet backup.');
  return {
    version: 1,
    algorithm: 'Ed25519',
    kdf: 'PBKDF2-SHA256',
    iterations: 600000,
    cipher: 'AES-256-GCM',
    publicKey: k.publicKey,
    salt: k.salt,
    iv: k.iv,
    ciphertext: k.ciphertext,
  };
}
export async function createKeystore(password: string): Promise<Keystore> {
  if (password.length < 12)
    throw new Error('Use a wallet password of at least 12 characters.');
  const secret = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  try {
    const publicKey = nativeParty(secret);
    const key = await encryptionKey(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(publicKey),
      },
      key,
      secret,
    );
    return {
      version: 1,
      algorithm: 'Ed25519',
      kdf: 'PBKDF2-SHA256',
      iterations: 600000,
      cipher: 'AES-256-GCM',
      publicKey,
      salt: bytesToHex(salt),
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(new Uint8Array(encrypted)),
    };
  } finally {
    secret.fill(0);
  }
}
export async function unlockKeystore(keystore: Keystore, password: string) {
  const stored = parseKeystore(keystore);
  const key = await encryptionKey(password, hexToBytes(stored.salt));
  let secret: Uint8Array;
  try {
    secret = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: hexToBytes(stored.iv),
          additionalData: new TextEncoder().encode(stored.publicKey),
        },
        key,
        hexToBytes(stored.ciphertext),
      ),
    );
  } catch {
    throw new Error('Wrong password or damaged wallet backup.');
  }
  if (nativeParty(secret) !== stored.publicKey) {
    secret.fill(0);
    throw new Error('Wallet public key does not match.');
  }
  return secret;
}
export async function signWithKeystore(
  envelope: Envelope,
  keystore: Keystore,
  password: string,
) {
  const secret = await unlockKeystore(keystore, password);
  try {
    return signEnvelope(envelope, secret);
  } finally {
    secret.fill(0);
  }
}
