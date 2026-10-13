import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;

/** Hash a password with scrypt. Format: scrypt$N$r$p$salt$hash (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** A hash that is never valid; used to keep login timing constant for unknown users. */
export const DUMMY_PASSWORD_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets stored in the database.
 * Ciphertext format: v1.<iv>.<tag>.<data> (base64url).
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(masterSecret: string) {
    if (masterSecret.length < 32) throw new Error('APP_SECRET must be at least 32 characters long');
    this.key = Buffer.from(crypto.hkdfSync('sha256', masterSecret, 'uptime-monitor', 'secret-box-v1', 32));
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || dataB64 === undefined) throw new Error('Invalid secret payload');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: Record<string, string>): string | null {
    return Object.keys(value).length === 0 ? null : this.encrypt(JSON.stringify(value));
  }

  decryptJson(payload: string | null | undefined): Record<string, string> {
    if (!payload) return {};
    return JSON.parse(this.decrypt(payload)) as Record<string, string>;
  }
}

/**
 * Resolve the master secret: APP_SECRET env var, or a key file generated on first boot
 * inside the data directory (permissions 0600).
 */
export function resolveMasterSecret(envSecret: string, dataDir: string): { secret: string; generated: boolean } {
  if (envSecret) return { secret: envSecret, generated: false };
  const file = path.join(dataDir, 'secret.key');
  if (fs.existsSync(file)) return { secret: fs.readFileSync(file, 'utf8').trim(), generated: false };
  fs.mkdirSync(dataDir, { recursive: true });
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return { secret, generated: true };
}
