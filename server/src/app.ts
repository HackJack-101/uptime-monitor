import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuth } from './auth.js';
import { config } from './config.js';
import type { AppContext } from './context.js';
import { hashPassword, randomToken, SecretBox } from './crypto.js';
import { Database } from './db.js';
import { HttpError } from './http.js';
import { NotificationEngine } from './notifications/engine.js';
import { authRoutes } from './routes/auth.js';
import { dnsRoutes } from './routes/dns.js';
import { metaRoutes } from './routes/meta.js';
import { monitorRoutes } from './routes/monitors.js';
import { notificationRoutes } from './routes/notifications.js';
import { projectRoutes } from './routes/projects.js';
import { userRoutes } from './routes/users.js';
import { Scheduler } from './scheduler.js';

export interface BuildOptions {
  databasePath: string;
  masterSecret: string;
  logger?: boolean | object;
  startScheduler?: boolean;
  staticDir?: string;
  bootstrap?: { email: string; password: string; name: string };
  ovhBaseUrl?: string;
}

export async function buildApp(opts: BuildOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: config.trustProxy,
    bodyLimit: 512 * 1024,
  });

  const db = new Database(opts.databasePath);
  const box = new SecretBox(opts.masterSecret);
  const notifier = new NotificationEngine(db, box, app.log);
  const scheduler = new Scheduler(db, box, notifier, app.log, {
    maxConcurrent: config.maxConcurrentChecks,
    retentionDays: config.retentionDays,
  });

  // First boot: create the superadmin from env vars, or generate a one-time setup token.
  let setupToken: string | null = null;
  const hasUsers = Boolean(db.get('SELECT 1 FROM users LIMIT 1'));
  if (!hasUsers) {
    const b = opts.bootstrap;
    if (b?.email && b.password) {
      if (b.password.length < 10) throw new Error('SUPERADMIN_PASSWORD must be at least 10 characters');
      db.run(
        "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'superadmin')",
        b.email.trim().toLowerCase(),
        b.name,
        await hashPassword(b.password),
      );
      app.log.info({ email: b.email }, 'superadmin account created from environment');
    } else {
      setupToken = randomToken(18);
      app.log.warn(`No account exists yet. Open the web UI and use this one-time setup token: ${setupToken}`);
    }
  }

  const ctx: AppContext = { db, box, notifier, scheduler, setupToken, ovhBaseUrl: opts.ovhBaseUrl };

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    // Allow plain-HTTP LAN deployments; HSTS should be set by the TLS-terminating proxy.
    strictTransportSecurity: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  app.setErrorHandler((err: Error & { statusCode?: number; details?: string[] }, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) req.log.error({ err }, 'request failed');
    void reply.status(status).send({
      error: status >= 500 ? 'Internal server error' : err.message,
      ...(err instanceof HttpError && err.details ? { details: err.details } : {}),
    });
  });

  registerAuth(app, db);
  authRoutes(app, ctx);
  userRoutes(app, ctx);
  projectRoutes(app, ctx);
  monitorRoutes(app, ctx);
  notificationRoutes(app, ctx);
  metaRoutes(app, ctx);
  dnsRoutes(app, ctx);

  const staticDir = opts.staticDir;
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false, maxAge: '1h' });
    // SPA fallback: every non-API GET returns index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.header('cache-control', 'no-cache').sendFile('index.html');
      return reply.status(404).send({ error: 'Not found' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Not found' }));
  }

  app.addHook('onClose', async () => {
    scheduler.stop();
    db.close();
  });

  if (opts.startScheduler !== false) app.addHook('onReady', async () => scheduler.start());

  return { app, ctx };
}
