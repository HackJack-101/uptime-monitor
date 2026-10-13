import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, currentUser, projectAccess, requireProject, visibleProjectsFilter } from '../auth.js';
import type { AppContext } from '../context.js';
import { nowIso } from '../db.js';
import { badRequest, HttpError, notFound, paramId, parse } from '../http.js';
import { mergeSecrets, parsePayload, secretPresence } from '../registry/fields.js';
import { getMonitorType } from '../registry/monitors.js';
import { resolveCheckSettings } from '../settings.js';
import type { MonitorRow, ProjectRow } from '../types.js';
import { checkSettingsSchema } from './projects.js';

const SETTING_KEYS = ['interval_s', 'timeout_s', 'retries', 'retry_interval_s', 'degraded_threshold_ms'] as const;

const baseSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.string(),
    enabled: z.boolean().default(true),
    inherit_notifications: z.boolean().default(true),
    config: z.record(z.string(), z.unknown()).default({}),
    secrets: z.record(z.string(), z.unknown()).default({}),
  })
  .extend(checkSettingsSchema.shape);

export function monitorRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, box, scheduler } = ctx;

  function toDto(m: MonitorRow, project?: ProjectRow) {
    const def = getMonitorType(m.type);
    let secrets: Record<string, string> = {};
    try {
      secrets = box.decryptJson(m.secrets);
    } catch {
      /* undecryptable secrets are reported as unset */
    }
    const { secrets: _encrypted, ...rest } = m;
    return {
      ...rest,
      enabled: Boolean(m.enabled),
      inherit_notifications: Boolean(m.inherit_notifications),
      config: JSON.parse(m.config) as Record<string, unknown>,
      secrets: def ? secretPresence(def, secrets) : {},
      ...(project ? { effective: resolveCheckSettings(project, m) } : {}),
    };
  }

  function loadMonitor(id: number, need: 'view' | 'edit', req: Parameters<typeof requireProject>[1]) {
    const monitor = db.get<MonitorRow>('SELECT * FROM monitors WHERE id = ?', id);
    if (!monitor) throw notFound('Monitor');
    const user = currentUser(req);
    if (!projectAccess(db, user, monitor.project_id)) throw notFound('Monitor');
    requireProject(db, req, monitor.project_id, need);
    return monitor;
  }

  function uptimeSince(hours: number, projectFilter: { sql: string; params: number[] }, monitorId?: number) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    return db.all<{ monitor_id: number; uptime: number; avg_latency: number | null; checks: number }>(
      `SELECT r.monitor_id, AVG(CASE WHEN r.status = 'down' THEN 0.0 ELSE 1.0 END) * 100 AS uptime,
              AVG(r.latency_ms) AS avg_latency, COUNT(*) AS checks
       FROM check_results r JOIN monitors m ON m.id = r.monitor_id
       WHERE r.checked_at >= ? AND ${projectFilter.sql.replace('project_id', 'm.project_id')} ${monitorId ? 'AND r.monitor_id = ?' : ''}
       GROUP BY r.monitor_id`,
      since,
      ...projectFilter.params,
      ...(monitorId ? [monitorId] : []),
    );
  }

  app.get('/api/monitors', async (req) => {
    const user = currentUser(req);
    const q = parse(z.object({ projectId: z.coerce.number().int().positive().optional() }), req.query);
    const filter = visibleProjectsFilter(user);
    const monitors = db.all<MonitorRow>(
      `SELECT * FROM monitors WHERE ${filter.sql} ${q.projectId ? 'AND project_id = ?' : ''} ORDER BY name COLLATE NOCASE`,
      ...filter.params,
      ...(q.projectId ? [q.projectId] : []),
    );
    const uptime = new Map(uptimeSince(24, filter).map((u) => [u.monitor_id, u]));
    // Last 30 results per monitor for the heartbeat bar.
    const recent = db.all<{ monitor_id: number; status: string; latency_ms: number | null; checked_at: string }>(
      `SELECT monitor_id, status, latency_ms, checked_at FROM (
         SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.monitor_id ORDER BY r.checked_at DESC) AS rn
         FROM check_results r JOIN monitors m ON m.id = r.monitor_id WHERE ${filter.sql.replace('project_id', 'm.project_id')}
       ) WHERE rn <= 30 ORDER BY checked_at ASC`,
      ...filter.params,
    );
    const projects = new Map(db.all<ProjectRow>('SELECT * FROM projects').map((p) => [p.id, p]));
    return {
      monitors: monitors.map((m) => ({
        ...toDto(m, projects.get(m.project_id)),
        project: { id: m.project_id, name: projects.get(m.project_id)?.name, color: projects.get(m.project_id)?.color },
        uptime24h: uptime.get(m.id)?.uptime ?? null,
        heartbeats: recent.filter((r) => r.monitor_id === m.id).map(({ monitor_id: _, ...r }) => r),
      })),
    };
  });

  app.get('/api/monitors/:id', async (req) => {
    const monitor = loadMonitor(paramId(req), 'view', req);
    const user = currentUser(req);
    const project = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', monitor.project_id)!;
    const filter = { sql: '1 = 1', params: [] };
    const stats = Object.fromEntries(
      ([['24h', 24], ['7d', 168], ['30d', 720]] as const).map(([k, h]) => [k, uptimeSince(h, filter, monitor.id)[0] ?? null]),
    );
    return {
      monitor: {
        ...toDto(monitor, project),
        project: { id: project.id, name: project.name, color: project.color },
        access: projectAccess(db, user, project.id),
      },
      stats,
    };
  });

  app.get('/api/monitors/:id/results', async (req) => {
    const monitor = loadMonitor(paramId(req), 'view', req);
    const q = parse(z.object({ hours: z.coerce.number().int().min(1).max(24 * 90).default(24) }), req.query);
    const since = new Date(Date.now() - q.hours * 3600_000).toISOString();
    // Aggregate into at most ~300 buckets so charts stay light whatever the range.
    const bucketS = Math.max(60, Math.ceil((q.hours * 3600) / 300));
    const results = db.all(
      `SELECT MIN(checked_at) AS checked_at,
              CAST(AVG(latency_ms) AS INTEGER) AS latency_ms,
              CASE WHEN SUM(status = 'down') > 0 THEN 'down' WHEN SUM(status = 'degraded') > 0 THEN 'degraded' ELSE 'up' END AS status,
              COUNT(*) AS checks, SUM(status = 'down') AS failures
       FROM check_results WHERE monitor_id = ? AND checked_at >= ?
       GROUP BY CAST(strftime('%s', checked_at) AS INTEGER) / ?
       ORDER BY checked_at`,
      monitor.id,
      since,
      bucketS,
    );
    const latest = db.all(
      'SELECT status, latency_ms, message, checked_at FROM check_results WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 50',
      monitor.id,
    );
    return { bucketSeconds: bucketS, results, latest };
  });

  app.get('/api/monitors/:id/incidents', async (req) => {
    const monitor = loadMonitor(paramId(req), 'view', req);
    return {
      incidents: db.all('SELECT * FROM incidents WHERE monitor_id = ? ORDER BY started_at DESC LIMIT 100', monitor.id),
    };
  });

  app.post('/api/monitors', async (req) => {
    const body = parse(baseSchema.extend({ project_id: z.number().int().positive() }), req.body);
    requireProject(db, req, body.project_id, 'edit');
    const def = getMonitorType(body.type);
    if (!def) throw badRequest(`Unknown monitor type: ${body.type}`);
    const payload = parsePayload(def, body.config, body.secrets);
    if (!payload.ok) throw badRequest('Invalid monitor configuration', payload.errors);
    const secrets = mergeSecrets({}, payload.value.secrets);
    const { lastInsertRowid } = db.run(
      `INSERT INTO monitors (project_id, name, type, enabled, inherit_notifications, config, secrets, status,
         interval_s, timeout_s, retries, retry_interval_s, degraded_threshold_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.project_id,
      body.name,
      body.type,
      Number(body.enabled),
      Number(body.inherit_notifications),
      JSON.stringify(payload.value.config),
      box.encryptJson(secrets),
      body.enabled ? 'pending' : 'paused',
      ...SETTING_KEYS.map((k) => body[k] ?? null),
    );
    scheduler.refresh(lastInsertRowid);
    audit(db, req, 'monitor.create', `${lastInsertRowid}:${body.name}`);
    return { monitor: toDto(db.get<MonitorRow>('SELECT * FROM monitors WHERE id = ?', lastInsertRowid)!) };
  });

  app.patch('/api/monitors/:id', async (req) => {
    const monitor = loadMonitor(paramId(req), 'edit', req);
    const body = parse(baseSchema.partial(), req.body);
    const type = body.type ?? monitor.type;
    const def = getMonitorType(type);
    if (!def) throw badRequest(`Unknown monitor type: ${type}`);

    let configJson = monitor.config;
    let secretsBlob = monitor.secrets;
    if (body.config !== undefined || body.secrets !== undefined || body.type !== undefined) {
      const existing = type === monitor.type ? box.decryptJson(monitor.secrets) : {};
      const payload = parsePayload(
        def,
        body.config ?? JSON.parse(monitor.config),
        body.secrets ?? {},
        new Set(Object.keys(existing)),
      );
      if (!payload.ok) throw badRequest('Invalid monitor configuration', payload.errors);
      configJson = JSON.stringify(payload.value.config);
      secretsBlob = box.encryptJson(mergeSecrets(existing, payload.value.secrets));
    }

    const enabled = body.enabled ?? Boolean(monitor.enabled);
    let status = monitor.status;
    if (!enabled) status = 'paused';
    else if (monitor.status === 'paused' || body.type || body.config) status = 'pending';

    const settings = Object.fromEntries(SETTING_KEYS.map((k) => [k, body[k] === undefined ? monitor[k] : body[k]]));
    db.run(
      `UPDATE monitors SET name = ?, type = ?, enabled = ?, inherit_notifications = ?, config = ?, secrets = ?, status = ?,
         consecutive_failures = CASE WHEN ? != status THEN 0 ELSE consecutive_failures END,
         interval_s = ?, timeout_s = ?, retries = ?, retry_interval_s = ?, degraded_threshold_ms = ?, updated_at = ?
       WHERE id = ?`,
      body.name ?? monitor.name,
      type,
      Number(enabled),
      Number(body.inherit_notifications ?? Boolean(monitor.inherit_notifications)),
      configJson,
      secretsBlob,
      status,
      status,
      ...SETTING_KEYS.map((k) => settings[k] ?? null),
      nowIso(),
      monitor.id,
    );
    if (status === 'paused' && monitor.status === 'down') {
      db.run('UPDATE incidents SET resolved_at = ? WHERE monitor_id = ? AND resolved_at IS NULL', nowIso(), monitor.id);
    }
    scheduler.refresh(monitor.id);
    audit(db, req, 'monitor.update', `${monitor.id}:${body.name ?? monitor.name}`);
    return { monitor: toDto(db.get<MonitorRow>('SELECT * FROM monitors WHERE id = ?', monitor.id)!) };
  });

  app.delete('/api/monitors/:id', async (req) => {
    const monitor = loadMonitor(paramId(req), 'edit', req);
    scheduler.unschedule(monitor.id);
    db.run('DELETE FROM monitors WHERE id = ?', monitor.id);
    audit(db, req, 'monitor.delete', `${monitor.id}:${monitor.name}`);
    return { ok: true };
  });

  app.post('/api/monitors/:id/check', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const monitor = loadMonitor(paramId(req), 'edit', req);
    const result = await scheduler.checkNow(monitor.id);
    if (!result) throw new HttpError(409, 'A check is already running for this monitor');
    if (monitor.enabled) scheduler.refresh(monitor.id);
    return { result };
  });
}
