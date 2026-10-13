import { describe, expect, it } from 'vitest';
import { mergeSecrets, parsePayload, secretPresence } from '../src/registry/fields.js';
import { getMonitorType } from '../src/registry/monitors.js';

const http = getMonitorType('http')!;

describe('parsePayload', () => {
  it('applies defaults', () => {
    const r = parsePayload(http, { url: 'https://example.com' }, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.config.method).toBe('GET');
      expect(r.value.config.expectedStatus).toBe('200-299');
      expect(r.value.config.auth).toBe('none');
    }
  });

  it('requires secrets only when their condition applies', () => {
    const missing = parsePayload(http, { url: 'https://example.com', auth: 'basic', username: 'bob' }, {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain('Password is required');

    const ok = parsePayload(http, { url: 'https://example.com', auth: 'basic', username: 'bob' }, { password: 'pw' });
    expect(ok.ok).toBe(true);
  });

  it('accepts an existing secret on update without resending it', () => {
    const r = parsePayload(http, { url: 'https://example.com', auth: 'bearer' }, {}, new Set(['token']));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.secrets.token).toBeUndefined();
  });

  it('clears secrets that no longer apply', () => {
    const r = parsePayload(http, { url: 'https://example.com', auth: 'none' }, {}, new Set(['token']));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.secrets.token).toBeNull();
  });

  it('rejects unknown secret keys and invalid URLs', () => {
    const r = parsePayload(http, { url: 'ftp://example.com' }, { nope: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith('URL'))).toBe(true);
      expect(r.errors).toContain('Unknown secret field: nope');
    }
  });

  it('rejects invalid header names', () => {
    const r = parsePayload(http, { url: 'https://example.com', headers: { 'bad header': 'x' } }, {});
    expect(r.ok).toBe(false);
  });
});

describe('secret helpers', () => {
  it('merges updates (set / clear / keep)', () => {
    expect(mergeSecrets({ a: '1', b: '2' }, { a: 'x', b: null, c: undefined })).toEqual({ a: 'x' });
  });

  it('reports presence without values', () => {
    expect(secretPresence(http, { token: 'abc' })).toEqual({ password: false, token: true, headerValue: false });
  });
});
