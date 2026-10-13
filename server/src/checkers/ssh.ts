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

const MAX_OUTPUT = 65536;
const SUMMARY_LINES = 3;
const SUMMARY_CHARS = 300;

/**
 * Short, single-line summary of a command output for the dashboard and alerts:
 * the first non-empty lines (stdout first, then stderr), without terminal escape codes.
 */
export function summarizeOutput(stdout: string, stderr = ''): string {
  const lines = `${stdout}\n${stderr}`
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[\x00-\x1f\x7f]/g, ' ').trim())
    .filter(Boolean);
  const summary = lines.slice(0, SUMMARY_LINES).join(' · ');
  const more = lines.length > SUMMARY_LINES ? ` (+${lines.length - SUMMARY_LINES} more)` : '';
  return summary.length > SUMMARY_CHARS ? `${summary.slice(0, SUMMARY_CHARS - 1)}…` : summary + more;
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
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => {
          if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8');
        });
        stream.stderr.on('data', (d: Buffer) => {
          if (stderr.length < MAX_OUTPUT) stderr += d.toString('utf8');
        });
        stream.on('close', (code: number | null) => {
          const latencyMs = elapsed(start);
          const output = summarizeOutput(stdout, stderr);
          const withOutput = (text: string) => (output ? `${text}: ${output}` : text);
          if (code !== 0) return finish({ ok: false, latencyMs, message: withOutput(`Command exited with code ${code ?? 'unknown'}`) });
          if (config.expectedOutput && !stdout.includes(String(config.expectedOutput))) {
            return finish({ ok: false, latencyMs, message: withOutput('Expected output not found') });
          }
          finish({ ok: true, latencyMs, message: output || 'Command succeeded' });
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
