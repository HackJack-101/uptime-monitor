import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, currentUser, isAdmin, projectAccess, requireAdmin, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { nowIso } from '../db.js';
import { HttpError, notFound, paramId, parse } from '../http.js';
import { DEFAULT_CHECK_SETTINGS, resolveCheckSettings } from '../settings.js';
import type { ProjectRow } from '../types.js';

/** Check rules shared by projects (defaults) and monitors (overrides). null = inherit. */
export const checkSettingsSchema = z.object({
  interval_s: z.number().int().min(20).max(86400).nullable().optional(),
  timeout_s: z.number().int().min(1).max(120).nullable().optional(),
  retries: z.number().int().min(0).max(10).nullable().optional(),
  retry_interval_s: z.number().int().min(10).max(3600).nullable().optional(),
  degraded_threshold_ms: z.number().int().min(1).max(120000).nullable().optional(),
});

const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  })
  .extend(checkSettingsSchema.shape);

const SETTING_KEYS = ['interval_s', 'timeout_s', 'retries', 'retry_interval_s', 'degraded_threshold_ms'] as const;

export function projectRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, scheduler } = ctx;

  function summary(projectIds: number[] | null) {
    const rows = db.all<{ project_id: number; status: string; n: number }>(
      'SELECT project_id, status, COUNT(*) AS n FROM monitors GROUP BY project_id, status',
    );
    const map = new Map<number, Record<string, number>>();
    for (const r of rows) {
      if (projectIds && !projectIds.includes(r.project_id)) continue;
      const s = map.get(r.project_id) ?? {};
      s[r.status] = r.n;
      map.set(r.project_id, s);
    }
    return map;
  }

  app.get('/api/projects', async (req) => {
    const user = currentUser(req);
    const projects = isAdmin(user)
      ? db.all<ProjectRow>('SELECT * FROM projects ORDER BY name COLLATE NOCASE')
      : db.all<ProjectRow>(
          `SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id
           WHERE m.user_id = ? ORDER BY p.name COLLATE NOCASE`,
          user.id,
        );
    const counts = summary(projects.map((p) => p.id));
    const members = db.all<{ project_id: number; n: number }>('SELECT project_id, COUNT(*) AS n FROM project_members GROUP BY project_id');
    return {
      projects: projects.map((p) => ({
        ...p,
        access: projectAccess(db, user, p.id),
        statusCounts: counts.get(p.id) ?? {},
        memberCount: members.find((m) => m.project_id === p.id)?.n ?? 0,
      })),
    };
  });

  app.get('/api/projects/:id', async (req) => {
    const id = paramId(req);
    const user = requireProject(db, req, id, 'view');
    const project = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id)!;
    return {
      project: {
        ...project,
        access: projectAccess(db, user, id),
        statusCounts: summary([id]).get(id) ?? {},
        effective: resolveCheckSettings(project, {}),
      },
      defaults: DEFAULT_CHECK_SETTINGS,
    };
  });

  app.post('/api/projects', async (req) => {
    requireAdmin(req);
    const body = parse(projectSchema, req.body);
    if (db.get('SELECT 1 FROM projects WHERE name = ?', body.name)) throw new HttpError(409, 'A project with this name already exists');
    const { lastInsertRowid } = db.run(
      `INSERT INTO projects (name, description, color, interval_s, timeout_s, retries, retry_interval_s, degraded_threshold_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      body.name,
      body.description,
      body.color,
      ...SETTING_KEYS.map((k) => body[k] ?? null),
    );
    audit(db, req, 'project.create', body.name);
    return { project: db.get('SELECT * FROM projects WHERE id = ?', lastInsertRowid) };
  });

  app.patch('/api/projects/:id', async (req) => {
    requireAdmin(req);
    const id = paramId(req);
    const project = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
    if (!project) throw notFound('Project');
    const body = parse(projectSchema.partial(), req.body);
    if (body.name && db.get('SELECT 1 FROM projects WHERE name = ? AND id != ?', body.name, id)) {
      throw new HttpError(409, 'A project with this name already exists');
    }
    const next = { ...project, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
    db.run(
      `UPDATE projects SET name = ?, description = ?, color = ?, interval_s = ?, timeout_s = ?, retries = ?,
         retry_interval_s = ?, degraded_threshold_ms = ?, updated_at = ? WHERE id = ?`,
      next.name,
      next.description,
      next.color,
      ...SETTING_KEYS.map((k) => next[k] ?? null),
      nowIso(),
      id,
    );
    // Interval changes must take effect for all monitors of the project.
    for (const m of db.all<{ id: number }>('SELECT id FROM monitors WHERE project_id = ?', id)) scheduler.refresh(m.id);
    audit(db, req, 'project.update', next.name);
    return { project: db.get('SELECT * FROM projects WHERE id = ?', id) };
  });

  app.delete('/api/projects/:id', async (req) => {
    requireAdmin(req);
    const id = paramId(req);
    const project = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
    if (!project) throw notFound('Project');
    for (const m of db.all<{ id: number }>('SELECT id FROM monitors WHERE project_id = ?', id)) scheduler.unschedule(m.id);
    db.run('DELETE FROM projects WHERE id = ?', id);
    audit(db, req, 'project.delete', project.name);
    return { ok: true };
  });

  app.get('/api/projects/:id/members', async (req) => {
    const id = paramId(req);
    requireProject(db, req, id, 'view');
    const members = db.all(
      `SELECT u.id, u.name, u.email, u.role AS user_role, m.role FROM project_members m
       JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY u.name COLLATE NOCASE`,
      id,
    );
    return { members };
  });

  app.put('/api/projects/:id/members', async (req) => {
    requireAdmin(req);
    const id = paramId(req);
    if (!db.get('SELECT 1 FROM projects WHERE id = ?', id)) throw notFound('Project');
    const body = parse(
      z.object({ members: z.array(z.object({ userId: z.number().int().positive(), role: z.enum(['viewer', 'editor']) })).max(1000) }),
      req.body,
    );
    db.transaction(() => {
      db.run('DELETE FROM project_members WHERE project_id = ?', id);
      for (const m of body.members) {
        if (!db.get('SELECT 1 FROM users WHERE id = ?', m.userId)) throw notFound('User');
        db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', id, m.userId, m.role);
      }
    });
    audit(db, req, 'project.members', String(id));
    return { ok: true };
  });
}
