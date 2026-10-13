import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { OvhClient } from '../src/ovh/client.js';
import { buildDnsView, hostState, monitorHost, type MonitorRef } from '../src/ovh/dnsView.js';
import { FAKE_CREDS, FAKE_RECORDS, startFakeOvh } from './fake-ovh.js';

let ovh: Awaited<ReturnType<typeof startFakeOvh>>;
beforeAll(async () => {
  ovh = await startFakeOvh();
});
afterAll(() => ovh.close());

describe('monitorHost', () => {
  it('extracts the hostname of every monitor type', () => {
    expect(monitorHost('http', { url: 'https://API.example.com:8443/health' })).toBe('api.example.com');
    expect(monitorHost('dns', { hostname: 'example.com.' })).toBe('example.com');
    expect(monitorHost('tcp', { host: 'db.example.com', port: 5432 })).toBe('db.example.com');
    expect(monitorHost('http', { url: 'not a url' })).toBeNull();
  });
});

describe('hostState', () => {
  it('uses the worst active monitor status', () => {
    expect(hostState([])).toBe('unmonitored');
    expect(hostState([{ status: 'up', enabled: true }, { status: 'down', enabled: true }])).toBe('error');
    expect(hostState([{ status: 'up', enabled: true }, { status: 'degraded', enabled: true }])).toBe('degraded');
    expect(hostState([{ status: 'down', enabled: false }, { status: 'up', enabled: true }])).toBe('running');
    expect(hostState([{ status: 'paused', enabled: false }])).toBe('paused');
  });
});

describe('buildDnsView', () => {
  const mon = (id: number, host: string, status: MonitorRef['status'] = 'up'): MonitorRef => ({ id, name: `m${id}`, type: 'http', status, enabled: true, host });

  it('classifies subdomains as running, error or not monitored', () => {
    const view = buildDnsView('example.com', FAKE_RECORDS, [
      mon(1, 'example.com'),
      mon(2, 'api.example.com', 'down'),
      mon(3, 'www.example.com', 'degraded'),
      mon(4, 'ghost.example.com'),
      mon(5, 'shop.apps.example.com'),
      mon(6, 'google.com'),
    ]);
    const state = Object.fromEntries(view.entries.map((e) => [e.fqdn, e.state]));
    expect(state).toEqual({
      'example.com': 'running',
      '*.apps.example.com': 'running',
      'api.example.com': 'error',
      'old.example.com': 'unmonitored',
      'www.example.com': 'degraded',
    });
    expect(view.entries.find((e) => e.fqdn === 'api.example.com')!.records).toHaveLength(2);
    // A wildcard only covers one extra label.
    expect(buildDnsView('example.com', FAKE_RECORDS, [mon(7, 'a.b.apps.example.com')]).orphans).toHaveLength(1);
    // Hosts resolved by a wildcard are attached to the wildcard row.
    expect(view.entries.find((e) => e.fqdn === '*.apps.example.com')!.monitors.map((m) => m.id)).toEqual([5]);
    // Monitors outside the zone are ignored; monitored hosts without record are reported.
    expect(view.orphans.map((o) => o.fqdn)).toEqual(['ghost.example.com']);
    expect(view.summary).toMatchObject({ running: 2, error: 1, degraded: 1, unmonitored: 1, missingRecord: 1 });
  });
});

describe('OvhClient', () => {
  it('signs requests and loads host records', async () => {
    const client = new OvhClient({ endpoint: 'ovh-eu', ...FAKE_CREDS }, ovh.url);
    expect(await client.listZones()).toEqual(['example.com', 'other.org']);
    const records = await client.hostRecords('example.com');
    expect(records.map((r) => r.id).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reports invalid credentials', async () => {
    const client = new OvhClient({ endpoint: 'ovh-eu', ...FAKE_CREDS, consumerKey: 'wrong' }, ovh.url);
    await expect(client.listZones()).rejects.toThrow(/rejected the credentials/);
  });
});

describe('OVH routes', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  let cookie: string;
  let viewerCookie: string;
  let projectId: number;
  const H = { 'x-requested-with': 'XMLHttpRequest' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, c: string, payload?: object) =>
    app.inject({ method, url, headers: { ...H, cookie: c }, ...(payload ? { payload } : {}) });
  const login = async (email: string, password: string) => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email, password } });
    return `monitor_session=${res.cookies.find((c) => c.name === 'monitor_session')!.value}`;
  };

  beforeAll(async () => {
    ({ app, ctx } = await buildApp({
      databasePath: ':memory:',
      masterSecret: 'y'.repeat(48),
      startScheduler: false,
      ovhBaseUrl: ovh.url,
      bootstrap: { email: 'root@example.com', password: 'rootpassword', name: 'Root' },
    }));
    await app.ready();
    cookie = await login('root@example.com', 'rootpassword');
    projectId = (await req('POST', '/api/projects', cookie, { name: 'Web' })).json().project.id;
    await req('POST', '/api/users', cookie, {
      email: 'viewer@example.com',
      name: 'Viewer',
      password: 'viewerpassword',
      role: 'user',
      memberships: [{ projectId, role: 'viewer' }],
    });
    viewerCookie = await login('viewer@example.com', 'viewerpassword');
    await req('POST', '/api/monitors', cookie, {
      project_id: projectId,
      name: 'API',
      type: 'http',
      enabled: false,
      config: { url: 'https://api.example.com/health' },
    });
  });
  afterAll(() => app.close());

  it('lists zones with submitted credentials (admins only)', async () => {
    const payload = { endpoint: 'ovh-eu', ...FAKE_CREDS };
    expect((await req('POST', `/api/projects/${projectId}/ovh/zones`, viewerCookie, payload)).statusCode).toBe(403);
    const res = await req('POST', `/api/projects/${projectId}/ovh/zones`, cookie, payload);
    expect(res.json().zones).toEqual(['example.com', 'other.org']);
  });

  it('rejects an inaccessible zone', async () => {
    const res = await req('PUT', `/api/projects/${projectId}/ovh`, cookie, { endpoint: 'ovh-eu', ...FAKE_CREDS, zone: 'nope.net' });
    expect(res.statusCode).toBe(502);
  });

  it('saves the account, encrypts secrets and never returns them', async () => {
    const res = await req('PUT', `/api/projects/${projectId}/ovh`, cookie, { endpoint: 'ovh-eu', ...FAKE_CREDS, zone: 'Example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(FAKE_CREDS.applicationSecret);
    expect(res.body).not.toContain(FAKE_CREDS.consumerKey);
    expect(res.json().account).toMatchObject({ zone: 'example.com', lastError: null });
    const raw = ctx.db.get<{ secrets: string }>('SELECT secrets FROM ovh_accounts WHERE project_id = ?', projectId)!;
    expect(raw.secrets).not.toContain(FAKE_CREDS.consumerKey);
  });

  it('keeps stored secrets when updating without them', async () => {
    const res = await req('PUT', `/api/projects/${projectId}/ovh`, cookie, { endpoint: 'ovh-eu', applicationKey: 'ak', zone: 'example.com' });
    expect(res.statusCode).toBe(200);
  });

  it('serves the DNS view to project members', async () => {
    const res = await req('GET', `/api/projects/${projectId}/dns`, viewerCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.zone).toBe('example.com');
    expect(body.entries.find((e: { fqdn: string }) => e.fqdn === 'api.example.com').state).toBe('paused');
    expect(body.summary.unmonitored).toBe(4);
    expect(res.body).not.toContain(FAKE_CREDS.consumerKey);
  });

  it('hides the integration from non-members and blocks viewer edits', async () => {
    const other = (await req('POST', '/api/projects', cookie, { name: 'Other' })).json().project.id;
    expect((await req('GET', `/api/projects/${other}/dns`, viewerCookie)).statusCode).toBe(404);
    expect((await req('DELETE', `/api/projects/${projectId}/ovh`, viewerCookie)).statusCode).toBe(403);
  });

  it('removes the account', async () => {
    expect((await req('DELETE', `/api/projects/${projectId}/ovh`, cookie)).statusCode).toBe(200);
    expect((await req('GET', `/api/projects/${projectId}/dns`, cookie)).statusCode).toBe(404);
  });
});
