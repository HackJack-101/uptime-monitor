import { promises as dns } from 'node:dns';
import net from 'node:net';
import { elapsed, errorMessage, type Checker } from './types.js';

function flatten(records: unknown[]): string[] {
  return records.map((r) => {
    if (typeof r === 'string') return r;
    if (Array.isArray(r)) return r.join('');
    if (r && typeof r === 'object' && 'exchange' in r) return String((r as { exchange: string }).exchange);
    return JSON.stringify(r);
  });
}

export const dnsChecker: Checker = async ({ config, timeoutMs }) => {
  const resolver = new dns.Resolver({ timeout: timeoutMs, tries: 1 });
  if (config.resolver) {
    if (!net.isIP(String(config.resolver))) return { ok: false, latencyMs: null, message: 'Resolver must be an IP address' };
    resolver.setServers([String(config.resolver)]);
  }
  const start = process.hrtime.bigint();
  try {
    const type = String(config.recordType ?? 'A');
    const answer: unknown = await resolver.resolve(String(config.hostname), type);
    const records = flatten(Array.isArray(answer) ? answer : [answer]);
    const latencyMs = elapsed(start);
    if (records.length === 0) return { ok: false, latencyMs, message: 'No records returned' };
    if (config.expectedValue && !records.some((r) => r.includes(String(config.expectedValue)))) {
      return { ok: false, latencyMs, message: `Expected value not found (got ${records.slice(0, 3).join(', ')})` };
    }
    return { ok: true, latencyMs, message: records.slice(0, 3).join(', ').slice(0, 200) };
  } catch (err) {
    return { ok: false, latencyMs: null, message: errorMessage(err) };
  }
};
