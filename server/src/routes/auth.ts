import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, createSession, currentUser, destroySession } from '../auth.js';
import type { AppContext } from '../context.js';
import { DUMMY_PASSWORD_HASH, hashPassword, safeEqual, verifyPassword } from '../crypto.js';
import { nowIso } from '../db.js';
import { badRequest, emailSchema, HttpError, nameSchema, parse, passwordSchema } from '../http.js';
import type { UserRow } from '../types.js';

export function authRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;
  const loginLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/setup', async () => ({ needsSetup: ctx.setupToken !== null }));

  app.post('/api/setup', loginLimit, async (req, reply) => {
    if (ctx.setupToken === null) throw new HttpError(409, 'Setup has already been completed');
    const body = parse(
      z.object({ token: z.string(), email: emailSchema, name: nameSchema, password: passwordSchema }),
      req.body,
    );
    if (!safeEqual(body.token.trim(), ctx.setupToken)) throw new HttpError(403, 'Invalid setup token');
    const { lastInsertRowid } = db.run(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'superadmin')",
      body.email,
      body.name,
      await hashPassword(body.password),
    );
    ctx.setupToken = null;
    req.user = { id: lastInsertRowid, email: body.email, name: body.name, role: 'superadmin' };
    audit(db, req, 'setup.complete', body.email);
    createSession(db, reply, req, lastInsertRowid);
    return { ok: true };
  });

  app.post('/api/auth/login', loginLimit, async (req, reply) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string().max(256) }), req.body);
    const user = db.get<UserRow>('SELECT * FROM users WHERE email = ?', body.email);
    // Always run a hash comparison so response time does not reveal whether the account exists.
    const valid = await verifyPassword(body.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid || !user.active) {
      req.log.warn({ email: body.email, ip: req.ip }, 'failed login');
      throw new HttpError(401, 'Invalid email or password');
    }
    db.run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    audit(db, req, 'auth.login');
    createSession(db, reply, req, user.id);
    return { user: req.user };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(db, reply, req.sessionId);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const user = currentUser(req);
    const projects = db.all<{ id: number; role: string }>(
      'SELECT project_id AS id, role FROM project_members WHERE user_id = ?',
      user.id,
    );
    return { user, memberships: projects };
  });

  app.patch('/api/auth/me', async (req) => {
    const user = currentUser(req);
    const body = parse(z.object({ name: nameSchema }), req.body);
    db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', body.name, nowIso(), user.id);
    return { user: { ...user, name: body.name } };
  });

  app.post('/api/auth/password', loginLimit, async (req) => {
    const user = currentUser(req);
    const body = parse(z.object({ currentPassword: z.string(), newPassword: passwordSchema }), req.body);
    const row = db.get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!;
    if (!(await verifyPassword(body.currentPassword, row.password_hash))) throw badRequest('Current password is incorrect');
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(body.newPassword), nowIso(), user.id);
    // Sign out every other session.
    db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', user.id, req.sessionId ?? '');
    audit(db, req, 'auth.password_change');
    return { ok: true };
  });
}
