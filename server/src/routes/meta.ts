import type { FastifyInstance } from 'fastify';
import { currentUser, visibleProjectsFilter } from '../auth.js';
import { smtpConfigured } from '../config.js';
import type { AppContext } from '../context.js';
import { channelTypes } from '../registry/channels.js';
import { monitorTypes } from '../registry/monitors.js';
import { DEFAULT_CHECK_SETTINGS } from '../settings.js';
import { RULE_EVENTS } from '../types.js';

export const VERSION = process.env.APP_VERSION ?? '0.1.0';

export function metaRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.get('/api/meta', async (req) => {
    currentUser(req);
    return {
      version: VERSION,
      monitorTypes,
      channelTypes,
      ruleEvents: RULE_EVENTS,
      defaults: DEFAULT_CHECK_SETTINGS,
      smtpConfigured: smtpConfigured(),
    };
  });

  app.get('/api/dashboard', async (req) => {
    const user = currentUser(req);
    const f = visibleProjectsFilter(user);
    const fm = { sql: f.sql.replace('project_id', 'm.project_id'), params: f.params };
    const statusCounts = Object.fromEntries(
      db
        .all<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM monitors WHERE ${f.sql} GROUP BY status`, ...f.params)
        .map((r) => [r.status, r.n]),
    );
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const uptime = db.get<{ uptime: number | null; latency: number | null }>(
      `SELECT AVG(CASE WHEN r.status = 'down' THEN 0.0 ELSE 1.0 END) * 100 AS uptime, AVG(r.latency_ms) AS latency
       FROM check_results r JOIN monitors m ON m.id = r.monitor_id WHERE r.checked_at >= ? AND ${fm.sql}`,
      since,
      ...fm.params,
    );
    const incidents = db.all(
      `SELECT i.*, m.name AS monitor_name, m.project_id, p.name AS project_name, p.color AS project_color
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id JOIN projects p ON p.id = m.project_id
       WHERE ${fm.sql} ORDER BY i.resolved_at IS NOT NULL, i.started_at DESC LIMIT 15`,
      ...fm.params,
    );
    const projectCount = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM projects WHERE ${f.sql.replace('project_id', 'id')}`, ...f.params);
    return {
      statusCounts,
      uptime24h: uptime?.uptime ?? null,
      avgLatency24h: uptime?.latency ? Math.round(uptime.latency) : null,
      projectCount: projectCount?.n ?? 0,
      incidents,
    };
  });
}
