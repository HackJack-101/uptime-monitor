import { execFile } from 'node:child_process';
import { errorMessage, isSafeHost, type Checker } from './types.js';

function run(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('ping', args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stdout ? errorMessage(err) : '')) });
    });
  });
}

export const pingChecker: Checker = async ({ config, timeoutMs }) => {
  const host = String(config.host);
  if (!isSafeHost(host)) return { ok: false, latencyMs: null, message: 'Invalid host' };
  const count = Math.min(10, Math.max(1, Number(config.count ?? 1)));
  const perPacketS = Math.max(1, Math.floor(timeoutMs / 1000 / count));
  const args =
    process.platform === 'darwin'
      ? ['-c', String(count), '-W', String(perPacketS * 1000), host]
      : ['-n', '-c', String(count), '-W', String(perPacketS), host];
  // "--" is not supported by every ping; isSafeHost already forbids a leading "-".
  const { code, stdout, stderr } = await run(args, timeoutMs + 2000);
  const times = [...stdout.matchAll(/time[=<]\s*([\d.]+)\s*ms/g)].map((m) => Number(m[1]));
  if (code === 0 && times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    return { ok: true, latencyMs: avg, message: `${times.length}/${count} packets received` };
  }
  const reason = stderr.trim().split('\n')[0] || `${times.length}/${count} packets received`;
  return { ok: false, latencyMs: null, message: reason };
};
