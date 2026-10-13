import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import('../src/build-info.js')).buildInfo;
}

afterEach(() => vi.unstubAllEnvs());

describe('buildInfo', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';

  it('exposes a 7-character commit and a GitHub link from CI build args', async () => {
    const info = await load({ GIT_COMMIT: sha, SOURCE_URL: 'https://github.com/HackJack-101/uptime-monitor', APP_VERSION: '' });
    expect(info.shortCommit).toBe('0123456');
    expect(info.commit).toBe(sha);
    expect(info.commitUrl).toBe(`https://github.com/HackJack-101/uptime-monitor/commit/${sha}`);
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('uses the release tag as version', async () => {
    expect((await load({ APP_VERSION: 'v1.4.0', GIT_COMMIT: sha })).version).toBe('1.4.0');
  });

  it('ignores invalid commit values and untrusted source URLs', async () => {
    const info = await load({ GIT_COMMIT: 'not-a-sha<script>', SOURCE_URL: 'javascript:alert(1)' });
    expect(info.commit).toBeNull();
    expect(info.commitUrl).toBeNull();
    expect((await load({ GIT_COMMIT: sha, SOURCE_URL: 'https://evil.example/x' })).commitUrl).toBeNull();
  });
});
