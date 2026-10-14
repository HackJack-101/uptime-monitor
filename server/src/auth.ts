import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { randomToken, sha256 } from './crypto.js';
import { nowIso, type Database } from './db.js';
import { forbidden, HttpError, notFound } from './http.js';
import type { MemberRole, Role, UserRow } from './types.js';

export const SESSION_COOKIE = 'monitor_session';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  locale: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
    sessionId?: string;
  }
}

const PUBLIC_ROUTES = new Set(['/api/health', '/api/auth/login', '/api/setup']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createSession(db: Database, reply: FastifyReply, req: FastifyRequest, userId: number): void {
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  db.run(
    'INSERT INTO sessions (id, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
    sha256(token),
    userId,
    req.ip,
    (req.headers['user-agent'] ?? '').slice(0, 300),
    expires.toISOString(),
  );
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: req.protocol === 'https',
    expires,
  });
}

export function destroySession(db: Database, reply: FastifyReply, sessionId?: string): void {
  if (sessionId) db.run('DELETE FROM sessions WHERE id = ?', sessionId);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function registerAuth(app: FastifyInstance, db: Database): void {
  app.addHook('onRequest', async (req) => {
    const url = req.url.split('?')[0]!;
    if (!url.startsWith('/api/')) return;

    // CSRF defence in depth (cookies are already SameSite=Strict): state-changing API calls
    // must carry a custom header, which browsers never add on cross-site form posts.
    if (!SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new HttpError(403, 'Missing X-Requested-With header');
    }

    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const id = sha256(token);
      const row = db.get<UserRow & { expires_at: string }>(
        `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
        id,
        nowIso(),
      );
      if (row) {
        req.user = { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
        req.sessionId = id;
      }
    }
    if (!req.user && !PUBLIC_ROUTES.has(url)) throw new HttpError(401, 'Authentication required');
  });
}

export function currentUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  return req.user;
}

export const isAdmin = (user: SessionUser): boolean => user.role === 'superadmin' || user.role === 'admin';

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = currentUser(req);
  if (!isAdmin(user)) throw forbidden();
  return user;
}

export type Access = 'edit' | 'view';

export function projectAccess(db: Database, user: SessionUser, projectId: number): Access | null {
  if (isAdmin(user)) return db.get('SELECT 1 FROM projects WHERE id = ?', projectId) ? 'edit' : null;
  const m = db.get<{ role: MemberRole }>('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', projectId, user.id);
  return m ? (m.role === 'editor' ? 'edit' : 'view') : null;
}

/** Throws 404 when the project is not visible (no information leak) and 403 when it is read-only. */
export function requireProject(db: Database, req: FastifyRequest, projectId: number, need: Access): SessionUser {
  const user = currentUser(req);
  const access = projectAccess(db, user, projectId);
  if (!access) throw notFound('Project');
  if (need === 'edit' && access !== 'edit') throw forbidden('You have read-only access to this project');
  return user;
}

/** SQL fragment + params restricting project ids to those the user can see. */
export function visibleProjectsFilter(user: SessionUser, column = 'project_id'): { sql: string; params: number[] } {
  if (isAdmin(user)) return { sql: '1 = 1', params: [] };
  return { sql: `${column} IN (SELECT project_id FROM project_members WHERE user_id = ?)`, params: [user.id] };
}

export function audit(db: Database, req: FastifyRequest, action: string, target?: string): void {
  db.run('INSERT INTO audit_log (user_id, action, target, ip) VALUES (?, ?, ?, ?)', req.user?.id ?? null, action, target ?? null, req.ip);
}
