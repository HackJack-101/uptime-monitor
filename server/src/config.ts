import path from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`Environment variable ${name} must be an integer`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: int('PORT', 3000),
  dataDir,
  databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, 'monitor.db'),
  /** Master secret used to encrypt monitor & channel secrets at rest. */
  appSecret: process.env.APP_SECRET ?? '',
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  trustProxy: bool('TRUST_PROXY', false),
  sessionTtlHours: int('SESSION_TTL_HOURS', 24 * 7),
  retentionDays: int('RETENTION_DAYS', 30),
  maxConcurrentChecks: int('MAX_CONCURRENT_CHECKS', 20),
  bootstrap: {
    email: process.env.SUPERADMIN_EMAIL ?? '',
    password: process.env.SUPERADMIN_PASSWORD ?? '',
    name: process.env.SUPERADMIN_NAME ?? 'Super Admin',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  staticDir: process.env.STATIC_DIR ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export type AppConfig = typeof config;

export function smtpConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.from);
}
