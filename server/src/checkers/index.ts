import { dnsChecker } from './dns.js';
import { httpChecker } from './http.js';
import { pingChecker } from './ping.js';
import { sshChecker } from './ssh.js';
import { tcpChecker } from './tcp.js';
import { tlsChecker } from './tls.js';
import type { CheckContext, CheckOutcome, Checker } from './types.js';

const checkers: Record<string, Checker> = {
  http: httpChecker,
  tcp: tcpChecker,
  ping: pingChecker,
  ssh: sshChecker,
  dns: dnsChecker,
  tls: tlsChecker,
};

/** Replace any secret value that leaks into a message (e.g. echoed by an error). */
export function redact(message: string, secrets: Record<string, string>): string {
  let out = message;
  for (const value of Object.values(secrets)) {
    if (value && value.length >= 4) out = out.split(value).join('••••');
  }
  return out.slice(0, 500);
}

export async function runCheck(type: string, ctx: CheckContext): Promise<CheckOutcome> {
  const checker = checkers[type];
  if (!checker) return { ok: false, latencyMs: null, message: `Unsupported monitor type: ${type}` };
  const outcome = await checker(ctx);
  return { ...outcome, message: redact(outcome.message, ctx.secrets) };
}
