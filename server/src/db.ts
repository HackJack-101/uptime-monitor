import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Row = Record<string, unknown>;

const migrations: string[] = [
  /* 001 - initial schema */ `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
    active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  -- Enforce a single superadmin at the database level.
  CREATE UNIQUE INDEX users_single_superadmin ON users (role) WHERE role = 'superadmin';

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions (user_id);

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#6366f1',
    interval_s INTEGER,
    timeout_s INTEGER,
    retries INTEGER,
    retry_interval_s INTEGER,
    degraded_threshold_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE project_members (
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    secrets TEXT,
    interval_s INTEGER,
    timeout_s INTEGER,
    retries INTEGER,
    retry_interval_s INTEGER,
    degraded_threshold_ms INTEGER,
    inherit_notifications INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_check_at TEXT,
    last_latency_ms INTEGER,
    last_message TEXT,
    cert_days_remaining INTEGER,
    status_changed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX monitors_project ON monitors (project_id);

  CREATE TABLE check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL REFERENCES monitors (id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    message TEXT,
    checked_at TEXT NOT NULL
  );
  CREATE INDEX check_results_monitor_time ON check_results (monitor_id, checked_at);

  CREATE TABLE incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL REFERENCES monitors (id) ON DELETE CASCADE,
    cause TEXT,
    started_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX incidents_monitor ON incidents (monitor_id, started_at);

  CREATE TABLE notification_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    secrets TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE notification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    monitor_id INTEGER REFERENCES monitors (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    events TEXT NOT NULL DEFAULT '["down","up"]',
    failure_threshold INTEGER NOT NULL DEFAULT 1,
    reminder_interval_min INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX notification_rules_project ON notification_rules (project_id);
  CREATE INDEX notification_rules_monitor ON notification_rules (monitor_id);

  CREATE TABLE notification_rule_channels (
    rule_id INTEGER NOT NULL REFERENCES notification_rules (id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES notification_channels (id) ON DELETE CASCADE,
    PRIMARY KEY (rule_id, channel_id)
  );

  CREATE TABLE notification_state (
    rule_id INTEGER NOT NULL REFERENCES notification_rules (id) ON DELETE CASCADE,
    monitor_id INTEGER NOT NULL REFERENCES monitors (id) ON DELETE CASCADE,
    last_event TEXT,
    last_sent_at TEXT,
    cert_sent_at TEXT,
    PRIMARY KEY (rule_id, monitor_id)
  );

  CREATE TABLE notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    monitor_id INTEGER REFERENCES monitors (id) ON DELETE SET NULL,
    channel_id INTEGER REFERENCES notification_channels (id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    success INTEGER NOT NULL,
    error TEXT,
    sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX notification_log_project ON notification_log (project_id, sent_at);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  /* 002 - OVH DNS zone integration (one account / zone per project) */ `
  CREATE TABLE ovh_accounts (
    project_id INTEGER PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    application_key TEXT NOT NULL,
    secrets TEXT NOT NULL,
    zone TEXT NOT NULL,
    records TEXT,
    synced_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  `,
  /* 003 - close incidents left open by the transition-based logic (edits reset the status to pending) */ `
  -- Older duplicates of an incident still open for the same monitor end when the newer one starts.
  UPDATE incidents SET resolved_at = (
    SELECT MIN(n.started_at) FROM incidents n
    WHERE n.monitor_id = incidents.monitor_id AND n.resolved_at IS NULL AND n.started_at > incidents.started_at
  )
  WHERE resolved_at IS NULL AND EXISTS (
    SELECT 1 FROM incidents n
    WHERE n.monitor_id = incidents.monitor_id AND n.resolved_at IS NULL AND n.started_at > incidents.started_at
  );
  -- Remaining open incidents of monitors that are not down end at the first successful check after they
  -- started (or now, if the history was purged).
  UPDATE incidents SET resolved_at = COALESCE(
    (SELECT MIN(r.checked_at) FROM check_results r
     WHERE r.monitor_id = incidents.monitor_id AND r.checked_at > incidents.started_at AND r.status != 'down'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  WHERE resolved_at IS NULL
    AND monitor_id IN (SELECT id FROM monitors WHERE status != 'down');
  `,
  /* 004 - per-user interface language (NULL = follow the browser) */ `
  ALTER TABLE users ADD COLUMN locale TEXT;
  `,
];

export class Database {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate(): void {
    const current = (this.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    for (let i = current; i < migrations.length; i++) {
      this.transaction(() => {
        this.raw.exec(migrations[i]!);
        this.raw.exec(`PRAGMA user_version = ${i + 1}`);
      });
    }
  }

  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number; lastInsertRowid: number } {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  close(): void {
    this.raw.close();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
