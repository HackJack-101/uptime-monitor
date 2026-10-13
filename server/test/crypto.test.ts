import { describe, expect, it } from 'vitest';
import { hashPassword, SecretBox, verifyPassword } from '../src/crypto.js';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password!', hash)).toBe(false);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('SecretBox', () => {
  const box = new SecretBox('a'.repeat(40));

  it('round-trips JSON secrets', () => {
    const blob = box.encryptJson({ password: 's3cr3t', token: 'abc' })!;
    expect(blob).not.toContain('s3cr3t');
    expect(box.decryptJson(blob)).toEqual({ password: 's3cr3t', token: 'abc' });
  });

  it('uses a random IV for each encryption', () => {
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('detects tampering', () => {
    const blob = box.encrypt('hello');
    const parts = blob.split('.');
    parts[3] = Buffer.from('jello').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('fails with another key', () => {
    const other = new SecretBox('b'.repeat(40));
    expect(() => other.decrypt(box.encrypt('hello'))).toThrow();
  });

  it('refuses short master secrets', () => {
    expect(() => new SecretBox('short')).toThrow();
  });

  it('returns null for empty secret maps', () => {
    expect(box.encryptJson({})).toBeNull();
    expect(box.decryptJson(null)).toEqual({});
  });
});
