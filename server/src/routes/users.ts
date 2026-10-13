import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, requireAdmin, type SessionUser } from '../auth.js';
import type { AppContext } from '../context.js';
import { hashPassword } from '../crypto.js';
import { nowIso, type Database } from '../db.js';
import { badRequest, emailSchema, forbidden, HttpError, nameSchema, notFound, paramId, parse, passwordSchema } from '../http.js';
import type { UserRow } from '../types.js';

const membershipsSchema = z
  .array(z.object({ projectId: z.number().int().positive(), role: z.enum(['viewer', 'editor']) }))
  .max(500);

/** Superadmin can manage everyone but themselves' role; admins can only manage plain users. */
function canManage(actor: SessionUser, target: Pick<UserRow, 'id' | 'role'>): boolean {
  if (target.role === 'superadmin') return actor.id === target.id;
  if (actor.role === 'superadmin') return true;
  return target.role === 'user';
}

function setMemberships(db: Database, userId: number, memberships: z.infer<typeof membershipsSchema>): void {
  db.run('DELETE FROM project_members WHERE user_id = ?', userId);
  for (const m of memberships) {
    if (!db.get('SELECT 1 FROM projects WHERE id = ?', m.projectId)) throw badRequest(`Project ${m.projectId} does not exist`);
    db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', m.projectId, userId, m.role);
  }
}

function listUsers(db: Database) {
  const users = db.all<UserRow>('SELECT * FROM users ORDER BY role = \'superadmin\' DESC, role, name COLLATE NOCASE');
  const members = db.all<{ user_id: number; project_id: number; role: string }>('SELECT * FROM project_members');
  return users.map(({ password_hash: _, ...u }) => ({
    ...u,
    active: Boolean(u.active),
    memberships: members.filter((m) => m.user_id === u.id).map((m) => ({ projectId: m.project_id, role: m.role })),
  }));
}

export function userRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.get('/api/users', async (req) => {
    requireAdmin(req);
    return { users: listUsers(db) };
  });

  app.post('/api/users', async (req) => {
    const actor = requireAdmin(req);
    const body = parse(
      z.object({
        email: emailSchema,
        name: nameSchema,
        password: passwordSchema,
        role: z.enum(['admin', 'user']),
        memberships: membershipsSchema.default([]),
      }),
      req.body,
    );
    if (body.role === 'admin' && actor.role !== 'superadmin') throw forbidden('Only the superadmin can create admins');
    if (db.get('SELECT 1 FROM users WHERE email = ?', body.email)) throw new HttpError(409, 'A user with this email already exists');
    const hash = await hashPassword(body.password);
    const id = db.transaction(() => {
      const { lastInsertRowid } = db.run(
        'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
        body.email,
        body.name,
        hash,
        body.role,
      );
      setMemberships(db, lastInsertRowid, body.memberships);
      return lastInsertRowid;
    });
    audit(db, req, 'user.create', body.email);
    return { user: listUsers(db).find((u) => u.id === id) };
  });

  app.patch('/api/users/:id', async (req) => {
    const actor = requireAdmin(req);
    const id = paramId(req);
    const target = db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (!target) throw notFound('User');
    if (!canManage(actor, target)) throw forbidden();
    const body = parse(
      z.object({
        email: emailSchema.optional(),
        name: nameSchema.optional(),
        password: passwordSchema.optional(),
        role: z.enum(['admin', 'user']).optional(),
        active: z.boolean().optional(),
        memberships: membershipsSchema.optional(),
      }),
      req.body,
    );
    if (target.id === actor.id && (body.role !== undefined || body.active === false)) {
      throw badRequest('You cannot change your own role or deactivate yourself');
    }
    if (target.role === 'superadmin' && body.role) throw badRequest('The superadmin role cannot be changed');
    if (body.role === 'admin' && actor.role !== 'superadmin') throw forbidden('Only the superadmin can promote admins');
    if (body.email && body.email !== target.email && db.get('SELECT 1 FROM users WHERE email = ? AND id != ?', body.email, id)) {
      throw new HttpError(409, 'A user with this email already exists');
    }
    const hash = body.password ? await hashPassword(body.password) : undefined;
    db.transaction(() => {
      db.run(
        `UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), role = COALESCE(?, role),
           active = COALESCE(?, active), password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?`,
        body.email ?? null,
        body.name ?? null,
        body.role ?? null,
        body.active === undefined ? null : Number(body.active),
        hash ?? null,
        nowIso(),
        id,
      );
      if (body.memberships) setMemberships(db, id, body.memberships);
      // Revoke sessions when credentials or access level change.
      if (hash || body.active === false || body.role) db.run('DELETE FROM sessions WHERE user_id = ?', id);
    });
    audit(db, req, 'user.update', target.email);
    return { user: listUsers(db).find((u) => u.id === id) };
  });

  app.delete('/api/users/:id', async (req) => {
    const actor = requireAdmin(req);
    const id = paramId(req);
    const target = db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (!target) throw notFound('User');
    if (target.id === actor.id) throw badRequest('You cannot delete your own account');
    if (target.role === 'superadmin' || !canManage(actor, target)) throw forbidden();
    db.run('DELETE FROM users WHERE id = ?', id);
    audit(db, req, 'user.delete', target.email);
    return { ok: true };
  });

  app.get('/api/audit', async (req) => {
    requireAdmin(req);
    const entries = db.all(
      `SELECT a.*, u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 200`,
    );
    return { entries };
  });
}
