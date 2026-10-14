import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import { Database } from '../src/db.js';

// Regression: editing a DOWN monitor reset its status to "pending", so the recovery (pending → up)
// never closed the incident and it stayed "Ongoing" on the dashboard.
let app: FastifyInstance;
let ctx: AppContext;
let cookie: string;
let server: net.Server;
let port: number;
const H = { 'x-requested-with': 'XMLHttpRequest' };
const call = (method: 'POST' | 'PATCH', url: string, payload: object) => app.inject({ method, url, headers: { ...H, cookie }, payload });

const listen = () => new Promise<void>((resolve) => (server = net.createServer((s) => s.destroy()).listen(port, '127.0.0.1', resolve)));
const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
const incidents = (id: number) =>
  ctx.db.all<{ resolved_at: string | null }>('SELECT resolved_at FROM incidents WHERE monitor_id = ? ORDER BY id', id);
const open = (id: number) => incidents(id).filter((i) => i.resolved_at === null).length;

beforeAll(async () => {
  ({ app, ctx } = await buildApp({
    databasePath: ':memory:',
    masterSecret: 'i'.repeat(48),
    startScheduler: false,
    bootstrap: { email: 'root@example.com', password: 'rootpassword', name: 'Root' },
  }));
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: 'root@example.com', password: 'rootpassword' } });
  cookie = `monitor_session=${res.cookies.find((c) => c.name === 'monitor_session')!.value}`;
  server = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.close();
  await app.close();
});

describe('incident lifecycle', () => {
  let projectId: number;
  beforeAll(async () => {
    projectId = (await call('POST', '/api/projects', { name: 'Incidents' })).json().project.id;
  });

  const createMonitor = async (name: string) =>
    (await call('POST', '/api/monitors', { project_id: projectId, name, type: 'tcp', config: { host: '127.0.0.1', port } })).json().monitor.id as number;
  const edit = (id: number, name: string) => call('PATCH', `/api/monitors/${id}`, { name, config: { host: '127.0.0.1', port } });

  it('closes the incident when a monitor edited while down recovers', async () => {
    const id = await createMonitor('edited');
    expect((await ctx.scheduler.checkNow(id))!.status).toBe('up');

    await stop();
    expect((await ctx.scheduler.checkNow(id))!.status).toBe('down');
    expect(open(id)).toBe(1);

    // Editing resets the status to pending; a still-failing check must not open a duplicate.
    expect((await edit(id, 'edited v2')).json().monitor.status).toBe('pending');
    expect((await ctx.scheduler.checkNow(id))!.status).toBe('down');
    expect(incidents(id)).toHaveLength(1);

    // Edit again (e.g. fixing a password), then the service recovers: pending → up closes it.
    await edit(id, 'edited v3');
    await listen();
    expect((await ctx.scheduler.checkNow(id))!.status).toBe('up');
    expect(incidents(id)).toHaveLength(1);
    expect(open(id)).toBe(0);
  });

  it('closes the incident when a pending monitor with an open outage is paused', async () => {
    const id = await createMonitor('paused');
    await stop();
    await ctx.scheduler.checkNow(id);
    await edit(id, 'paused v2'); // status: pending, incident still open
    expect(open(id)).toBe(1);
    expect((await call('PATCH', `/api/monitors/${id}`, { enabled: false })).json().monitor.status).toBe('paused');
    expect(open(id)).toBe(0);
    await listen();
  });
});

describe('migration 003', () => {
  it('repairs incidents left open by the old logic', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'um-')), 'm.db');
    const db = new Database(file);
    db.run("INSERT INTO projects (name) VALUES ('P')");
    const mk = (status: string) =>
      db.run("INSERT INTO monitors (project_id, name, type, status) VALUES (1, ?, 'tcp', ?)", status, status).lastInsertRowid;
    const recovered = mk('up');
    const stillDown = mk('down');
    const result = (m: number, status: string, at: string) =>
      db.run('INSERT INTO check_results (monitor_id, status, checked_at) VALUES (?, ?, ?)', m, status, at);
    const incident = (m: number, at: string) => db.run('INSERT INTO incidents (monitor_id, started_at) VALUES (?, ?)', m, at);

    // Recovered monitor: outage at 10:00, back up at 10:05, incident never closed.
    incident(recovered, '2026-10-14T10:00:00.000Z');
    result(recovered, 'down', '2026-10-14T10:01:00.000Z');
    result(recovered, 'up', '2026-10-14T10:05:00.000Z');
    // Down monitor with a duplicate opened after an edit.
    incident(stillDown, '2026-10-14T09:00:00.000Z');
    incident(stillDown, '2026-10-14T09:30:00.000Z');
    // Back to the schema of version 2, so that migration 003 (and the later ones) run again.
    db.raw.exec('ALTER TABLE users DROP COLUMN locale; PRAGMA user_version = 2');
    db.close();

    const reopened = new Database(file);
    const rows = reopened.all<{ monitor_id: number; started_at: string; resolved_at: string | null }>(
      'SELECT monitor_id, started_at, resolved_at FROM incidents ORDER BY id',
    );
    expect(rows).toEqual([
      { monitor_id: recovered, started_at: '2026-10-14T10:00:00.000Z', resolved_at: '2026-10-14T10:05:00.000Z' },
      { monitor_id: stillDown, started_at: '2026-10-14T09:00:00.000Z', resolved_at: '2026-10-14T09:30:00.000Z' },
      { monitor_id: stillDown, started_at: '2026-10-14T09:30:00.000Z', resolved_at: null },
    ]);
    reopened.close();
  });
});

describe('dashboard incidents', () => {
  it('lists ongoing incidents and those resolved in the last 7 days only', async () => {
    const projectId = (await call('POST', '/api/projects', { name: 'Dashboard' })).json().project.id;
    const id = (await call('POST', '/api/monitors', { project_id: projectId, name: 'dash', type: 'tcp', config: { host: '127.0.0.1', port } })).json().monitor.id;
    const day = 86_400_000;
    const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
    const add = (cause: string, started: string, resolved: string | null) =>
      ctx.db.run('INSERT INTO incidents (monitor_id, cause, started_at, resolved_at) VALUES (?, ?, ?, ?)', id, cause, started, resolved);
    add('old-ongoing', ago(30), null);
    add('old-resolved', ago(10), ago(9));
    add('recent-resolved', ago(2), ago(1));

    const res = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { cookie } });
    const causes = (res.json().incidents as { cause: string; monitor_id: number }[]).filter((i) => i.monitor_id === id).map((i) => i.cause);
    expect(causes).toEqual(['old-ongoing', 'recent-resolved']);
    expect(res.json().incidentWindowDays).toBe(7);
  });
});
