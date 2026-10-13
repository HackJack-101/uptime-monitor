import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';

// PATCH endpoints must only change the fields they receive (regression: pausing a monitor
// failed with "URL is required" because defaults were re-applied to missing fields).
let app: FastifyInstance;
let ctx: AppContext;
let cookie: string;
const H = { 'x-requested-with': 'XMLHttpRequest' };
const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  app.inject({ method, url, headers: { ...H, cookie }, ...(payload ? { payload } : {}) });

let projectId: number;

beforeAll(async () => {
  ({ app, ctx } = await buildApp({
    databasePath: ':memory:',
    masterSecret: 'p'.repeat(48),
    startScheduler: false,
    bootstrap: { email: 'root@example.com', password: 'rootpassword', name: 'Root' },
  }));
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: 'root@example.com', password: 'rootpassword' } });
  cookie = `monitor_session=${res.cookies.find((c) => c.name === 'monitor_session')!.value}`;
  projectId = (await call('POST', '/api/projects', { name: 'P', description: 'Keep me', color: '#10b981', interval_s: 120 })).json().project.id;
});
afterAll(() => app.close());

describe('monitor PATCH', () => {
  let id: number;
  const original = { url: 'https://example.com/health', auth: 'basic', username: 'bob' };

  beforeAll(async () => {
    const res = await call('POST', '/api/monitors', {
      project_id: projectId,
      name: 'API',
      type: 'http',
      inherit_notifications: false,
      interval_s: 45,
      config: original,
      secrets: { password: 'pw' },
    });
    id = res.json().monitor.id;
  });

  it('pauses without touching config, secrets or other options', async () => {
    const res = await call('PATCH', `/api/monitors/${id}`, { enabled: false });
    expect(res.statusCode).toBe(200);
    const m = res.json().monitor;
    expect(m).toMatchObject({ enabled: false, status: 'paused', inherit_notifications: false, interval_s: 45 });
    expect(m.config).toMatchObject(original);
    expect(m.secrets.password).toBe(true);
  });

  it('keeps the monitor paused when only the name changes', async () => {
    const m = (await call('PATCH', `/api/monitors/${id}`, { name: 'API v2' })).json().monitor;
    expect(m).toMatchObject({ name: 'API v2', enabled: false, status: 'paused' });
  });

  it('resumes', async () => {
    const m = (await call('PATCH', `/api/monitors/${id}`, { enabled: true })).json().monitor;
    expect(m).toMatchObject({ enabled: true, status: 'pending', inherit_notifications: false });
    expect(ctx.box.decryptJson(ctx.db.get<{ secrets: string }>('SELECT secrets FROM monitors WHERE id = ?', id)!.secrets)).toEqual({ password: 'pw' });
  });

  it('still resets an override to inherit with null', async () => {
    const m = (await call('PATCH', `/api/monitors/${id}`, { interval_s: null })).json().monitor;
    expect(m.interval_s).toBeNull();
  });
});

describe('channel, rule and project PATCH', () => {
  it('keeps unspecified channel and rule fields', async () => {
    const channel = (
      await call('POST', `/api/projects/${projectId}/channels`, { name: 'Hook', type: 'webhook', enabled: false, config: { url: 'https://example.com/h' } })
    ).json().channel;
    const ch = (await call('PATCH', `/api/channels/${channel.id}`, { name: 'Hook 2' })).json().channel;
    expect(ch).toMatchObject({ name: 'Hook 2', enabled: false, config: { url: 'https://example.com/h' } });

    const rule = (
      await call('POST', `/api/projects/${projectId}/rules`, {
        name: 'R',
        enabled: false,
        events: ['down', 'degraded'],
        failure_threshold: 3,
        reminder_interval_min: 30,
        channel_ids: [channel.id],
      })
    ).json().rule;
    const r = (await call('PATCH', `/api/rules/${rule.id}`, { name: 'R2' })).json().rule;
    expect(r).toMatchObject({ name: 'R2', enabled: false, events: ['down', 'degraded'], failure_threshold: 3, reminder_interval_min: 30, channel_ids: [channel.id] });
  });

  it('keeps unspecified project fields', async () => {
    const p = (await call('PATCH', `/api/projects/${projectId}`, { name: 'P2' })).json().project;
    expect(p).toMatchObject({ name: 'P2', description: 'Keep me', color: '#10b981', interval_s: 120 });
  });
});
