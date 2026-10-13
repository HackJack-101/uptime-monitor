import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Server, utils } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCheck } from '../src/checkers/index.js';
import { fingerprint, summarizeOutput } from '../src/checkers/ssh.js';

const hostKey = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;
const parsedHostKey = utils.parseKey(hostKey);
if (parsedHostKey instanceof Error || Array.isArray(parsedHostKey)) throw new Error('Cannot parse test host key');
const hostFingerprint = fingerprint(parsedHostKey.getPublicSSH());

/** Commands understood by the fake server, emulating the health-check script of the guide. */
const COMMANDS: Record<string, { out?: string; err?: string; code: number }> = {
  ok: { out: 'OK disk=42% mem_avail=63% load=0.12\n', code: 0 },
  disk: { out: 'FAIL: disk / at 93%\n\x1b[31mFAIL: service nginx is not active\x1b[0m\n', code: 1 },
  stderr: { err: 'sh: uptime-check: not found\n', code: 127 },
  silent: { code: 0 },
};

let server: Server;
let port: number;

beforeAll(async () => {
  server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'uptime-monitor' && ctx.password === 'pw') ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        accept().once('exec', (acceptExec, _reject, info) => {
          const stream = acceptExec();
          const c = COMMANDS[info.command] ?? { err: 'unknown command\n', code: 2 };
          if (c.out) stream.write(c.out);
          if (c.err) stream.stderr.write(c.err);
          stream.exit(c.code);
          stream.end();
        });
      });
    });
    client.on('error', () => {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server.close());

const check = (config: Record<string, unknown>, password = 'pw') =>
  runCheck('ssh', {
    config: { host: '127.0.0.1', port, username: 'uptime-monitor', authMethod: 'password', ...config },
    secrets: { password },
    timeoutMs: 5000,
  });

describe('summarizeOutput', () => {
  it('keeps the first lines on one line, without escape codes', () => {
    expect(summarizeOutput('a\n\nb\n', 'c\nd\n')).toBe('a · b · c (+1 more)');
    expect(summarizeOutput('\x1b[31mred\x1b[0m\tx')).toBe('red x');
    expect(summarizeOutput('x'.repeat(500))).toHaveLength(300);
    expect(summarizeOutput('', '')).toBe('');
  });
});

describe('ssh checker', () => {
  it('shows the script output when healthy', async () => {
    const r = await check({ command: 'ok', expectedOutput: 'OK' });
    expect(r).toMatchObject({ ok: true, message: 'OK disk=42% mem_avail=63% load=0.12' });
  });

  it('shows why the command failed', async () => {
    const r = await check({ command: 'disk' });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Command exited with code 1: FAIL: disk / at 93% · FAIL: service nginx is not active');
  });

  it('includes stderr (e.g. missing script)', async () => {
    expect((await check({ command: 'stderr' })).message).toBe('Command exited with code 127: sh: uptime-check: not found');
  });

  it('reports a missing expected output with what was received', async () => {
    const r = await check({ command: 'ok', expectedOutput: 'HEALTHY' });
    expect(r).toMatchObject({ ok: false, message: 'Expected output not found: OK disk=42% mem_avail=63% load=0.12' });
  });

  it('falls back to a generic message without output', async () => {
    expect((await check({ command: 'silent' })).message).toBe('Command succeeded');
  });

  it('pins the host key', async () => {
    expect((await check({ command: 'ok', hostKeySha256: hostFingerprint })).ok).toBe(true);
    const mismatch = await check({ command: 'ok', hostKeySha256: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    expect(mismatch).toMatchObject({ ok: false, message: 'Host key fingerprint mismatch' });
  });

  it('never leaks the password in messages', async () => {
    const r = await check({ command: 'ok' }, 'wrong-password-123');
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain('wrong-password-123');
  });
});
