import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_CREDS = { applicationKey: 'ak', applicationSecret: 'as-secret', consumerKey: 'ck-secret' };

export const FAKE_RECORDS = [
  { id: 1, subDomain: '', fieldType: 'A', target: '203.0.113.10', ttl: 3600 },
  { id: 2, subDomain: 'www', fieldType: 'CNAME', target: 'example.com.', ttl: 3600 },
  { id: 3, subDomain: 'api', fieldType: 'A', target: '203.0.113.11', ttl: 300 },
  { id: 4, subDomain: 'api', fieldType: 'AAAA', target: '2001:db8::11', ttl: 300 },
  { id: 5, subDomain: 'old', fieldType: 'A', target: '203.0.113.99', ttl: 3600 },
  { id: 6, subDomain: '*.apps', fieldType: 'A', target: '203.0.113.20', ttl: 3600 },
];

/** Minimal OVH API emulator that verifies request signatures. */
export async function startFakeOvh(): Promise<{ url: string; close: () => void; calls: string[] }> {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/auth/time') return res.end(String(Math.floor(Date.now() / 1000)));
    calls.push(url.pathname + url.search);

    const ts = String(req.headers['x-ovh-timestamp']);
    const expected = `$1$${crypto
      .createHash('sha1')
      .update([FAKE_CREDS.applicationSecret, FAKE_CREDS.consumerKey, 'GET', `${base}${req.url}`, '', ts].join('+'))
      .digest('hex')}`;
    if (req.headers['x-ovh-application'] !== FAKE_CREDS.applicationKey || req.headers['x-ovh-signature'] !== expected) {
      return send(403, { message: 'Invalid signature' });
    }
    if (url.pathname === '/domain/zone') return send(200, ['example.com', 'other.org']);
    if (url.pathname === '/domain/zone/example.com') return send(200, { name: 'example.com' });
    if (url.pathname === '/domain/zone/example.com/record') {
      const type = url.searchParams.get('fieldType');
      return send(200, FAKE_RECORDS.filter((r) => r.fieldType === type).map((r) => r.id));
    }
    const m = url.pathname.match(/^\/domain\/zone\/example\.com\/record\/(\d+)$/);
    if (m) return send(200, { ...FAKE_RECORDS.find((r) => r.id === Number(m[1])), zone: 'example.com' });
    if (url.pathname.startsWith('/domain/zone/')) return send(404, { message: 'This service does not exist' });
    send(404, { message: 'Not found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close(), calls };
}
