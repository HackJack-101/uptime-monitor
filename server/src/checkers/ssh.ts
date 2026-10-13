import crypto from 'node:crypto';
import net from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';
import { elapsed, errorMessage, type Checker, type CheckOutcome } from './types.js';

function bannerCheck(host: string, port: number, timeoutMs: number): Promise<CheckOutcome> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = net.connect({ host, port });
    let buffer = '';
    const done = (outcome: CheckOutcome) => {
      socket.destroy();
      resolve(outcome);
    };
    socket.setTimeout(timeoutMs, () => done({ ok: false, latencyMs: null, message: `Timed out after ${timeoutMs} ms` }));
    socket.on('error', (err) => done({ ok: false, latencyMs: null, message: errorMessage(err) }));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const line = buffer.split(/\r?\n/)[0] ?? '';
      if (line.startsWith('SSH-')) done({ ok: true, latencyMs: elapsed(start), message: line.slice(0, 120) });
      else if (buffer.length > 1024) done({ ok: false, latencyMs: null, message: 'No SSH banner received' });
    });
  });
}

export function fingerprint(key: Buffer): string {
  return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

export const sshChecker: Checker = async ({ config, secrets, timeoutMs }) => {
  const host = String(config.host);
  const port = Number(config.port ?? 22);
  if (config.authMethod === 'none') return bannerCheck(host, port, timeoutMs);

  return new Promise<CheckOutcome>((resolve) => {
    const start = process.hrtime.bigint();
    const client = new Client();
    let settled = false;
    const finish = (outcome: CheckOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ ok: false, latencyMs: null, message: `Timed out after ${timeoutMs} ms` }), timeoutMs);

    const expectedFp = String(config.hostKeySha256 ?? '').trim();
    const options: ConnectConfig = {
      host,
      port,
      username: String(config.username),
      readyTimeout: timeoutMs,
      hostVerifier: expectedFp
        ? (key: Buffer) => fingerprint(key) === (expectedFp.startsWith('SHA256:') ? expectedFp : `SHA256:${expectedFp}`)
        : undefined,
    };
    if (config.authMethod === 'key') {
      options.privateKey = secrets.privateKey;
      if (secrets.passphrase) options.passphrase = secrets.passphrase;
    } else {
      options.password = secrets.password;
    }

    client.on('error', (err) => {
      const msg = /verification failed/i.test(err.message) ? 'Host key fingerprint mismatch' : errorMessage(err);
      finish({ ok: false, latencyMs: null, message: msg });
    });
    client.on('ready', () => {
      const connectMs = elapsed(start);
      if (!config.command) return finish({ ok: true, latencyMs: connectMs, message: 'Authenticated' });
      client.exec(String(config.command), (err, stream) => {
        if (err) return finish({ ok: false, latencyMs: null, message: errorMessage(err) });
        let output = '';
        stream.on('data', (d: Buffer) => {
          if (output.length < 65536) output += d.toString('utf8');
        });
        stream.stderr.on('data', () => {});
        stream.on('close', (code: number | null) => {
          const latencyMs = elapsed(start);
          if (code !== 0) return finish({ ok: false, latencyMs, message: `Command exited with code ${code}` });
          if (config.expectedOutput && !output.includes(String(config.expectedOutput))) {
            return finish({ ok: false, latencyMs, message: 'Expected output not found' });
          }
          finish({ ok: true, latencyMs, message: 'Command succeeded' });
        });
      });
    });
    try {
      client.connect(options);
    } catch (err) {
      finish({ ok: false, latencyMs: null, message: errorMessage(err) });
    }
  });
};
