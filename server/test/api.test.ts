import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';

let app: FastifyInstance;
let ctx: AppContext;

const H = { 'x-requested-with': 'XMLHttpRequest' };

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email, password } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'monitor_session')!;
  expect(cookie.httpOnly).toBe(true);
  return `monitor_session=${cookie.value}`;
}

function as(cookie: string) {
  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers: { cookie } }),
    post: (url: string, payload?: object) => app.inject({ method: 'POST', url, headers: { ...H, cookie }, payload: payload ?? {} }),
    patch: (url: string, payload: object) => app.inject({ method: 'PATCH', url, headers: { ...H, cookie }, payload }),
    put: (url: string, payload: object) => app.inject({ method: 'PUT', url, headers: { ...H, cookie }, payload }),
    del: (url: string) => app.inject({ method: 'DELETE', url, headers: { ...H, cookie } }),
  };
}

let superCookie: string;

beforeAll(async () => {
  ({ app, ctx } = await buildApp({ databasePath: ':memory:', masterSecret: 'x'.repeat(48), startScheduler: false }));
  await app.ready();
});

afterAll(() => app.close());

describe('setup', () => {
  it('requires the setup token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({ needsSetup: true });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: H,
      payload: { token: 'wrong', email: 'root@example.com', name: 'Root', password: 'superpassword' },
    });
    expect(bad.statusCode).toBe(403);
  });

  it('creates the superadmin once', async () => {
    const token = ctx.setupToken!;
    const ok = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: H,
      payload: { token, email: 'root@example.com', name: 'Root', password: 'superpassword' },
    });
    expect(ok.statusCode).toBe(200);
    const again = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: H,
      payload: { token, email: 'x@example.com', name: 'X', password: 'superpassword' },
    });
    expect(again.statusCode).toBe(409);
    superCookie = await login('root@example.com', 'superpassword');
  });
});

describe('authentication', () => {
  it('rejects anonymous API calls', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
  });

  it('rejects wrong passwords', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: 'root@example.com', password: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('requires the CSRF header on mutations', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', headers: { cookie: superCookie }, payload: { name: 'X' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('profile', () => {
  it('stores the interface language per user', async () => {
    const me = as(superCookie);
    expect((await me.get('/api/auth/me')).json().user.locale).toBeNull();
    const res = await me.patch('/api/auth/me', { locale: 'fr-FR' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ locale: 'fr-FR', name: 'Root' });
    expect((await me.get('/api/auth/me')).json().user.locale).toBe('fr-FR');
    expect((await me.patch('/api/auth/me', { locale: 'de-DE' })).statusCode).toBe(400);
    await me.patch('/api/auth/me', { name: 'Root Admin' });
    expect((await me.get('/api/auth/me')).json().user).toMatchObject({ locale: 'fr-FR', name: 'Root Admin' });
    await me.patch('/api/auth/me', { locale: null, name: 'Root' });
    expect((await me.get('/api/auth/me')).json().user.locale).toBeNull();
  });
});

describe('roles, projects and secrets', () => {
  let adminCookie: string;
  let userCookie: string;
  let projectA: number;
  let projectB: number;
  let userId: number;

  it('lets the superadmin create admins and projects', async () => {
    const root = as(superCookie);
    projectA = (await root.post('/api/projects', { name: 'Alpha' })).json().project.id;
    projectB = (await root.post('/api/projects', { name: 'Beta', interval_s: 300 })).json().project.id;
    const admin = await root.post('/api/users', { email: 'admin@example.com', name: 'Admin', password: 'adminpassword', role: 'admin' });
    expect(admin.statusCode).toBe(200);
    adminCookie = await login('admin@example.com', 'adminpassword');
  });

  it('forbids a second superadmin at the database level', () => {
    expect(() =>
      ctx.db.run("INSERT INTO users (email, name, password_hash, role) VALUES ('b@x.io', 'B', 'x', 'superadmin')"),
    ).toThrow();
  });

  it('prevents admins from creating admins', async () => {
    const res = await as(adminCookie).post('/api/users', { email: 'a2@example.com', name: 'A2', password: 'adminpassword', role: 'admin' });
    expect(res.statusCode).toBe(403);
  });

  it('lets admins create users assigned to projects', async () => {
    const res = await as(adminCookie).post('/api/users', {
      email: 'user@example.com',
      name: 'User',
      password: 'userpassword',
      role: 'user',
      memberships: [{ projectId: projectA, role: 'viewer' }],
    });
    expect(res.statusCode).toBe(200);
    userId = res.json().user.id;
    userCookie = await login('user@example.com', 'userpassword');
  });

  it('prevents admins from modifying the superadmin', async () => {
    const users = (await as(adminCookie).get('/api/users')).json().users;
    const root = users.find((u: { role: string }) => u.role === 'superadmin');
    expect((await as(adminCookie).patch(`/api/users/${root.id}`, { name: 'Hacked' })).statusCode).toBe(403);
    expect((await as(adminCookie).del(`/api/users/${root.id}`)).statusCode).toBe(403);
  });

  it('only shows assigned projects to users', async () => {
    const list = (await as(userCookie).get('/api/projects')).json().projects;
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Alpha']);
    expect((await as(userCookie).get(`/api/projects/${projectB}`)).statusCode).toBe(404);
  });

  it('never returns monitor secrets', async () => {
    const res = await as(adminCookie).post('/api/monitors', {
      project_id: projectA,
      name: 'API',
      type: 'http',
      enabled: false,
      config: { url: 'https://example.com', auth: 'bearer' },
      secrets: { token: 'super-secret-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('super-secret-token');
    const id = res.json().monitor.id;
    expect(res.json().monitor.secrets).toEqual({ password: false, token: true, headerValue: false });

    const raw = ctx.db.get<{ secrets: string }>('SELECT secrets FROM monitors WHERE id = ?', id)!;
    expect(raw.secrets).not.toContain('super-secret-token');

    const detail = await as(userCookie).get(`/api/monitors/${id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain('super-secret-token');

    // Updating without resending the secret keeps it.
    const upd = await as(adminCookie).patch(`/api/monitors/${id}`, { name: 'API v2', config: { url: 'https://example.org', auth: 'bearer' } });
    expect(upd.statusCode).toBe(200);
    expect(ctx.box.decryptJson(ctx.db.get<{ secrets: string }>('SELECT secrets FROM monitors WHERE id = ?', id)!.secrets)).toEqual({
      token: 'super-secret-token',
    });
  });

  it('requires a project for monitors', async () => {
    const res = await as(adminCookie).post('/api/monitors', { name: 'X', type: 'tcp', config: { host: 'a', port: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it('makes viewers read-only', async () => {
    const res = await as(userCookie).post('/api/monitors', { project_id: projectA, name: 'X', type: 'tcp', config: { host: 'a', port: 1 } });
    expect(res.statusCode).toBe(403);
  });

  it('lets editors manage monitors in their project only', async () => {
    await as(adminCookie).patch(`/api/users/${userId}`, { memberships: [{ projectId: projectA, role: 'editor' }] });
    const ok = await as(userCookie).post('/api/monitors', {
      project_id: projectA,
      name: 'DB',
      type: 'tcp',
      enabled: false,
      config: { host: 'db', port: 5432 },
    });
    expect(ok.statusCode).toBe(200);
    const denied = await as(userCookie).post('/api/monitors', {
      project_id: projectB,
      name: 'DB',
      type: 'tcp',
      config: { host: 'db', port: 5432 },
    });
    expect(denied.statusCode).toBe(404);
  });

  it('scopes notification rules and channels to the project', async () => {
    const admin = as(adminCookie);
    const chA = (await admin.post(`/api/projects/${projectA}/channels`, {
      name: 'Discord',
      type: 'discord',
      secrets: { webhookUrl: 'https://discord.com/api/webhooks/1/secret' },
    })).json().channel;
    expect(chA.secrets).toEqual({ webhookUrl: true });
    const chB = (await admin.post(`/api/projects/${projectB}/channels`, {
      name: 'Hook',
      type: 'webhook',
      config: { url: 'https://example.com/hook' },
    })).json().channel;

    const crossProject = await admin.post(`/api/projects/${projectA}/rules`, { name: 'R', events: ['down'], channel_ids: [chB.id] });
    expect(crossProject.statusCode).toBe(400);

    const rule = await admin.post(`/api/projects/${projectA}/rules`, { name: 'Project rule', events: ['down', 'up'], channel_ids: [chA.id] });
    expect(rule.statusCode).toBe(200);
    expect(rule.json().rule.monitor_id).toBeNull();
  });

  it('revokes sessions when a user is deactivated', async () => {
    await as(adminCookie).patch(`/api/users/${userId}`, { active: false });
    expect((await as(userCookie).get('/api/projects')).statusCode).toBe(401);
  });
});
