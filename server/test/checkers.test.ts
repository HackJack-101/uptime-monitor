import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redact, runCheck } from '../src/checkers/index.js';
import { isSafeHost, statusMatcher } from '../src/checkers/types.js';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/secure') {
      const expected = `Basic ${Buffer.from('bob:pw').toString('base64')}`;
      res.writeHead(req.headers.authorization === expected ? 200 : 401).end('secure');
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: '/' }).end();
    } else if (req.url === '/error') {
      res.writeHead(503).end('down');
    } else {
      res.writeHead(200).end('hello world');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe('statusMatcher', () => {
  it('matches codes and ranges', () => {
    const m = statusMatcher('200-299, 301');
    expect(m(204)).toBe(true);
    expect(m(301)).toBe(true);
    expect(m(302)).toBe(false);
  });
});

describe('isSafeHost', () => {
  it('rejects argument injection', () => {
    expect(isSafeHost('example.com')).toBe(true);
    expect(isSafeHost('::1')).toBe(true);
    expect(isSafeHost('-f')).toBe(false);
    expect(isSafeHost('a b')).toBe(false);
    expect(isSafeHost('a;rm')).toBe(false);
  });
});

describe('http checker', () => {
  const run = (config: Record<string, unknown>, secrets: Record<string, string> = {}) =>
    runCheck('http', { config: { expectedStatus: '200-299', ...config }, secrets, timeoutMs: 3000 });

  it('succeeds on 200', async () => {
    const r = await run({ url: `${base}/` });
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('fails on unexpected status', async () => {
    const r = await run({ url: `${base}/error` });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('503');
  });

  it('checks keywords', async () => {
    expect((await run({ url: `${base}/`, keyword: 'world' })).ok).toBe(true);
    expect((await run({ url: `${base}/`, keyword: 'nope' })).ok).toBe(false);
    expect((await run({ url: `${base}/`, keyword: 'world', keywordMode: 'not_contains' })).ok).toBe(false);
  });

  it('sends basic auth', async () => {
    expect((await run({ url: `${base}/secure`, auth: 'basic', username: 'bob' }, { password: 'pw' })).ok).toBe(true);
    expect((await run({ url: `${base}/secure`, auth: 'basic', username: 'bob' }, { password: 'bad' })).ok).toBe(false);
  });

  it('follows redirects unless disabled', async () => {
    expect((await run({ url: `${base}/redirect`, followRedirects: true })).ok).toBe(true);
    expect((await run({ url: `${base}/redirect`, followRedirects: false })).ok).toBe(false);
  });

  it('reports connection errors', async () => {
    const r = await run({ url: 'http://127.0.0.1:1/' });
    expect(r.ok).toBe(false);
  });
});

describe('tcp checker', () => {
  it('detects open and closed ports', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as AddressInfo).port;
    expect((await runCheck('tcp', { config: { host: '127.0.0.1', port }, secrets: {}, timeoutMs: 2000 })).ok).toBe(true);
    srv.close();
    expect((await runCheck('tcp', { config: { host: '127.0.0.1', port: 1 }, secrets: {}, timeoutMs: 2000 })).ok).toBe(false);
  });
});

describe('redact', () => {
  it('removes secret values from messages', () => {
    expect(redact('connect to https://user:hunter22@host failed', { password: 'hunter22' })).toBe('connect to https://user:••••@host failed');
  });
});
