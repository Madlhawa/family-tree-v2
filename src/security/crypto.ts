/**
 * Encryption for everything the app stores, using only the browser's built-in Web Crypto.
 *
 * - A random 256-bit AES-GCM "data key" encrypts every record.
 * - The data key is stored twice, wrapped (encrypted) by:
 *     1. a key derived from the user's password (PBKDF2-SHA256, 600 000 rounds, random salt)
 *     2. a key derived from a one-time recovery code (128 random bits)
 * - Each record uses a fresh random 96-bit IV, and the record's identity is bound in as
 *   additional authenticated data, so records can't be swapped or edited without detection.
 * - After unlocking, the data key is held as a non-extractable CryptoKey: page scripts can
 *   use it, but can't read its bytes.
 */

export const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Sealed {
  /** base64 IV */
  iv: string;
  /** base64 ciphertext + GCM tag */
  ct: string;
}

export interface WrappedKey extends Sealed {
  salt: string;
  iterations: number;
}

export interface VaultHeader {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  password: WrappedKey;
  recovery: WrappedKey;
  createdAt: number;
  changedAt: number;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This browser does not support secure encryption (Web Crypto). Open the app over https in an up-to-date browser.');
  return s;
}

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Derive an AES-GCM key-wrapping key from a secret. */
export async function deriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']);
}

const WRAP_AAD = enc.encode('family-tree/data-key/v1');

async function wrap(dataKey: CryptoKey, secret: string, iterations: number): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKey(secret, salt, iterations);
  const ct = await subtle().wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv, additionalData: WRAP_AAD });
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iterations };
}

export class WrongSecretError extends Error {
  constructor() {
    super('Wrong password');
  }
}

/** Unwrap the data key. The result is non-extractable unless asked otherwise. */
export async function unwrap(w: WrappedKey, secret: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveKey(secret, fromB64(w.salt), w.iterations);
  try {
    return await subtle().unwrapKey('raw', fromB64(w.ct), kek, { name: 'AES-GCM', iv: fromB64(w.iv), additionalData: WRAP_AAD }, { name: 'AES-GCM', length: 256 }, extractable, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    throw new WrongSecretError();
  }
}

/** Crockford base32 alphabet: no I, L, O or U, so codes are easy to read and type. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 25 base32 characters = 125 random bits, shown as 5 groups of 5. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(25);
  let s = '';
  for (const b of bytes) s += B32[b & 31];
  return s.match(/.{5}/g)!.join('-');
}

export function normaliseRecoveryCode(input: string): string {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return s.match(/.{1,5}/g)?.join('-') ?? '';
}

export interface NewVault {
  header: VaultHeader;
  key: CryptoKey;
  recoveryCode: string;
}

export async function createVault(password: string, iterations = PBKDF2_ITERATIONS): Promise<NewVault> {
  const raw = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const recoveryCode = newRecoveryCode();
  const [pw, rc] = await Promise.all([wrap(raw, password, iterations), wrap(raw, recoveryCode, iterations)]);
  const now = Date.now();
  const header: VaultHeader = { v: 1, kdf: 'PBKDF2-SHA256', password: pw, recovery: rc, createdAt: now, changedAt: now };
  // Re-import as non-extractable for day-to-day use.
  const key = await unwrap(pw, password);
  return { header, key, recoveryCode };
}

export async function unlockWithPassword(header: VaultHeader, password: string): Promise<CryptoKey> {
  return unwrap(header.password, password);
}

/**
 * Set a new password. The data itself is not re-encrypted: only the wrapped data key changes.
 * - via 'password': `secret` is the current password; the recovery code stays the same.
 * - via 'recovery': `secret` is the recovery code; since it has now been used, a new one is issued.
 */
export async function changePassword(
  header: VaultHeader,
  via: 'password' | 'recovery',
  secret: string,
  newPassword: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ header: VaultHeader; key: CryptoKey; recoveryCode?: string }> {
  const raw = await unwrap(via === 'password' ? header.password : header.recovery, via === 'recovery' ? normaliseRecoveryCode(secret) : secret, true);
  const pw = await wrap(raw, newPassword, iterations);
  let recovery = header.recovery;
  let recoveryCode: string | undefined;
  if (via === 'recovery') {
    recoveryCode = newRecoveryCode();
    recovery = await wrap(raw, recoveryCode, iterations);
  }
  const next: VaultHeader = { ...header, password: pw, recovery, changedAt: Date.now() };
  return { header: next, key: await unwrap(pw, newPassword), recoveryCode };
}

/** Replace the recovery code (for when the old one is lost). Needs the current password. */
export async function regenerateRecovery(header: VaultHeader, password: string, iterations = PBKDF2_ITERATIONS): Promise<{ header: VaultHeader; recoveryCode: string }> {
  const raw = await unwrap(header.password, password, true);
  const recoveryCode = newRecoveryCode();
  const recovery = await wrap(raw, recoveryCode, iterations);
  return { header: { ...header, recovery, changedAt: Date.now() }, recoveryCode };
}

export async function seal(key: CryptoKey, value: unknown, aad: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function open<T>(key: CryptoKey, sealed: Sealed, aad: string): Promise<T> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: enc.encode(aad) }, key, fromB64(sealed.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

export function isSealed(v: unknown): v is Sealed {
  return !!v && typeof v === 'object' && typeof (v as Sealed).iv === 'string' && typeof (v as Sealed).ct === 'string';
}

// ---------- Password-encrypted files (backups) ----------

export const ENCRYPTED_BACKUP_FORMAT = 'family-tree-encrypted-backup';

export interface EncryptedFile extends Sealed {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  v: 1;
  kdf: 'PBKDF2-SHA256';
  salt: string;
  iterations: number;
}

const FILE_AAD = 'family-tree/backup-file/v1';

export async function encryptFile(text: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedFile> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, iterations);
  const sealed = await seal(key, text, FILE_AAD);
  return { format: ENCRYPTED_BACKUP_FORMAT, v: 1, kdf: 'PBKDF2-SHA256', salt: toB64(salt), iterations, ...sealed };
}

export async function decryptFile(file: EncryptedFile, password: string): Promise<string> {
  if (!Number.isInteger(file.iterations) || file.iterations < 100_000 || file.iterations > 10_000_000) throw new Error('Unsupported encrypted file');
  const key = await deriveKey(password, fromB64(file.salt), file.iterations);
  try {
    return await open<string>(key, file, FILE_AAD);
  } catch {
    throw new WrongSecretError();
  }
}

export function isEncryptedFile(j: unknown): j is EncryptedFile {
  return !!j && typeof j === 'object' && (j as EncryptedFile).format === ENCRYPTED_BACKUP_FORMAT && isSealed(j);
}
