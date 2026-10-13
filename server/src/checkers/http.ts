import http from 'node:http';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';
import { daysUntil, elapsed, errorMessage, statusMatcher, type Checker } from './types.js';

const MAX_BODY = 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'UptimeMonitor/1.0 (+https://github.com/HackJack-101/uptime-monitor)';

interface HttpResponse {
  status: number;
  body: string;
  certValidTo?: Date;
  location?: string;
}

function request(
  url: URL,
  options: { method: string; headers: Record<string, string>; body?: string; ignoreTls: boolean; timeoutMs: number; readBody: boolean },
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: options.method,
        headers: options.headers,
        timeout: options.timeoutMs,
        rejectUnauthorized: !options.ignoreTls,
        // Do not reuse connections: each check must measure a full handshake and see the cert.
        agent: false,
      },
      (res) => {
        let certValidTo: Date | undefined;
        const socket = res.socket as TLSSocket;
        if (typeof socket.getPeerCertificate === 'function') {
          const cert = socket.getPeerCertificate();
          if (cert?.valid_to) certValidTo = new Date(cert.valid_to);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (!options.readBody || size >= MAX_BODY) return;
          size += chunk.length;
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).subarray(0, MAX_BODY).toString('utf8'),
            certValidTo,
            location: res.headers.location,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${options.timeoutMs} ms`)));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export const httpChecker: Checker = async ({ config, secrets, timeoutMs }) => {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: '*/*', ...(config.headers ?? {}) };
  if (config.auth === 'basic') {
    headers.authorization = `Basic ${Buffer.from(`${config.username}:${secrets.password ?? ''}`).toString('base64')}`;
  } else if (config.auth === 'bearer') {
    headers.authorization = `Bearer ${secrets.token ?? ''}`;
  } else if (config.auth === 'header' && config.headerName) {
    headers[String(config.headerName).toLowerCase()] = secrets.headerValue ?? '';
  }
  const method = String(config.method ?? 'GET');
  const body = config.body && method !== 'GET' && method !== 'HEAD' ? String(config.body) : undefined;
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
    headers['content-type'] = body.trim().startsWith('{') ? 'application/json' : 'text/plain';
  }

  const start = process.hrtime.bigint();
  const deadline = Date.now() + timeoutMs;
  try {
    let url = new URL(String(config.url));
    let res: HttpResponse | undefined;
    let certValidTo: Date | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const remaining = Math.max(1, deadline - Date.now());
      res = await request(url, {
        method: hop === 0 ? method : 'GET',
        headers,
        body: hop === 0 ? body : undefined,
        ignoreTls: Boolean(config.ignoreTls),
        timeoutMs: remaining,
        readBody: Boolean(config.keyword),
      });
      certValidTo ??= res.certValidTo;
      const isRedirect = res.status >= 300 && res.status < 400 && res.location;
      if (!isRedirect || config.followRedirects === false) break;
      const next = new URL(res.location!, url);
      // Never forward credentials to another origin.
      if (next.origin !== url.origin) {
        delete headers.authorization;
        if (config.auth === 'header' && config.headerName) delete headers[String(config.headerName).toLowerCase()];
      }
      url = next;
    }
    const latencyMs = elapsed(start);
    const r = res!;
    const certDaysRemaining = certValidTo ? daysUntil(certValidTo) : undefined;

    const accepted = statusMatcher(String(config.expectedStatus || '200-299'));
    if (!accepted(r.status)) {
      return { ok: false, latencyMs, message: `Unexpected status code ${r.status}`, certDaysRemaining };
    }
    if (config.keyword) {
      const found = r.body.includes(String(config.keyword));
      const wanted = config.keywordMode !== 'not_contains';
      if (found !== wanted) {
        return {
          ok: false,
          latencyMs,
          message: wanted ? 'Keyword not found in response' : 'Forbidden keyword found in response',
          certDaysRemaining,
        };
      }
    }
    return { ok: true, latencyMs, message: `HTTP ${r.status}`, certDaysRemaining };
  } catch (err) {
    return { ok: false, latencyMs: null, message: errorMessage(err) };
  }
};
