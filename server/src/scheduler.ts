import type { FastifyBaseLogger } from 'fastify';
import { runCheck } from './checkers/index.js';
import type { SecretBox } from './crypto.js';
import { nowIso, type Database } from './db.js';
import type { NotificationEngine } from './notifications/engine.js';
import { resolveCheckSettings } from './settings.js';
import type { MonitorRow, MonitorStatus, ProjectRow } from './types.js';

/** Small counting semaphore to cap concurrent checks. */
class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => {
      this.active--;
      this.queue.shift()?.();
    };
  }
}

export interface CheckResultSummary {
  status: MonitorStatus;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

export class Scheduler {
  private timers = new Map<number, NodeJS.Timeout>();
  private running = new Set<number>();
  private semaphore: Semaphore;
  private maintenanceTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly notifier: NotificationEngine,
    private readonly log: FastifyBaseLogger,
    private readonly opts: { maxConcurrent: number; retentionDays: number },
  ) {
    this.semaphore = new Semaphore(opts.maxConcurrent);
  }

  start(): void {
    const monitors = this.db.all<{ id: number }>('SELECT id FROM monitors WHERE enabled = 1');
    for (const m of monitors) this.schedule(m.id, Math.random() * 10_000); // spread the first wave
    this.maintenanceTimer = setInterval(() => this.cleanup(), 3600_000);
    this.maintenanceTimer.unref();
    this.cleanup();
    this.log.info({ monitors: monitors.length }, 'scheduler started');
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  /** (Re)schedule a monitor after it was created / updated. */
  refresh(monitorId: number): void {
    this.unschedule(monitorId);
    const m = this.db.get<{ enabled: number }>('SELECT enabled FROM monitors WHERE id = ?', monitorId);
    if (m?.enabled) this.schedule(monitorId, 1000);
  }

  unschedule(monitorId: number): void {
    const t = this.timers.get(monitorId);
    if (t) clearTimeout(t);
    this.timers.delete(monitorId);
  }

  private schedule(monitorId: number, delayMs: number): void {
    if (this.stopped) return;
    this.unschedule(monitorId);
    const timer = setTimeout(() => {
      this.timers.delete(monitorId);
      void this.tick(monitorId);
    }, delayMs);
    timer.unref();
    this.timers.set(monitorId, timer);
  }

  private async tick(monitorId: number): Promise<void> {
    try {
      const result = await this.checkNow(monitorId);
      if (!result) return;
      const monitor = this.db.get<MonitorRow>('SELECT * FROM monitors WHERE id = ?', monitorId);
      const project = monitor && this.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', monitor.project_id);
      if (!monitor || !project || !monitor.enabled) return;
      const s = resolveCheckSettings(project, monitor);
      // While retrying a failure (not yet confirmed DOWN), use the shorter retry interval.
      const retrying = monitor.consecutive_failures > 0 && monitor.consecutive_failures <= s.retries;
      this.schedule(monitorId, (retrying ? s.retryIntervalS : s.intervalS) * 1000);
    } catch (err) {
      this.log.error({ err, monitorId }, 'check tick failed');
      this.schedule(monitorId, 60_000);
    }
  }

  /** Run a check immediately and persist the result. Returns undefined if the monitor is gone or already running. */
  async checkNow(monitorId: number): Promise<CheckResultSummary | undefined> {
    if (this.running.has(monitorId)) return undefined;
    this.running.add(monitorId);
    const release = await this.semaphore.acquire();
    try {
      const monitor = this.db.get<MonitorRow>('SELECT * FROM monitors WHERE id = ?', monitorId);
      if (!monitor) return undefined;
      const project = this.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', monitor.project_id)!;
      const settings = resolveCheckSettings(project, monitor);
      const config = JSON.parse(monitor.config) as Record<string, unknown>;
      let secrets: Record<string, string>;
      try {
        secrets = this.box.decryptJson(monitor.secrets);
      } catch {
        return this.record(monitor, project, { ok: false, latencyMs: null, message: 'Unable to decrypt secrets (APP_SECRET changed?)' }, settings, config);
      }
      const outcome = await runCheck(monitor.type, { config, secrets, timeoutMs: settings.timeoutS * 1000 });
      return this.record(monitor, project, outcome, settings, config);
    } finally {
      release();
      this.running.delete(monitorId);
    }
  }

  private async record(
    monitor: MonitorRow,
    project: ProjectRow,
    outcome: { ok: boolean; latencyMs: number | null; message: string; certDaysRemaining?: number },
    settings: ReturnType<typeof resolveCheckSettings>,
    config: Record<string, unknown>,
  ): Promise<CheckResultSummary> {
    const checkedAt = nowIso();
    const previous = monitor.status;
    const failures = outcome.ok ? 0 : monitor.consecutive_failures + 1;
    let status: MonitorStatus;
    if (!monitor.enabled) {
      // Manual check on a paused monitor: record the result but keep it paused.
      status = 'paused';
    } else if (outcome.ok) {
      const slow = settings.degradedThresholdMs !== null && outcome.latencyMs !== null && outcome.latencyMs > settings.degradedThresholdMs;
      status = slow ? 'degraded' : 'up';
    } else if (failures > settings.retries) {
      status = 'down';
    } else {
      // Not yet confirmed: keep the previous state (or pending on first run).
      status = previous === 'paused' ? 'pending' : previous;
    }
    const message = outcome.ok && status === 'degraded' ? `${outcome.message} (slow: ${outcome.latencyMs} ms)` : outcome.message;
    const changed = status !== previous;

    this.db.transaction(() => {
      this.db.run(
        `UPDATE monitors SET status = ?, consecutive_failures = ?, last_check_at = ?, last_latency_ms = ?, last_message = ?,
           cert_days_remaining = COALESCE(?, cert_days_remaining), status_changed_at = CASE WHEN ? THEN ? ELSE status_changed_at END
         WHERE id = ?`,
        status,
        failures,
        checkedAt,
        outcome.latencyMs,
        message,
        outcome.certDaysRemaining ?? null,
        changed ? 1 : 0,
        checkedAt,
        monitor.id,
      );
      this.db.run(
        'INSERT INTO check_results (monitor_id, status, latency_ms, message, checked_at) VALUES (?, ?, ?, ?, ?)',
        monitor.id,
        outcome.ok ? status : 'down',
        outcome.latencyMs,
        message,
        checkedAt,
      );
      if (status === 'paused') {
        // no incident tracking while paused
      } else if (changed && status === 'down') {
        this.db.run('INSERT INTO incidents (monitor_id, cause, started_at) VALUES (?, ?, ?)', monitor.id, message, checkedAt);
      } else if (changed && previous === 'down') {
        this.db.run('UPDATE incidents SET resolved_at = ? WHERE monitor_id = ? AND resolved_at IS NULL', checkedAt, monitor.id);
      }
    });

    if (status === 'paused') return { status, latencyMs: outcome.latencyMs, message, checkedAt };
    const certThreshold = Number(config.certExpiryDays ?? 0);
    await this.notifier
      .handle({
        monitor: { ...monitor, status },
        project,
        previous,
        current: status,
        downChecks: status === 'down' ? failures - settings.retries : 0,
        certDaysRemaining: outcome.certDaysRemaining,
        certThresholdDays: certThreshold > 0 ? certThreshold : undefined,
        message,
      })
      .catch((err) => this.log.error({ err, monitorId: monitor.id }, 'notification handling failed'));

    return { status, latencyMs: outcome.latencyMs, message, checkedAt };
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.opts.retentionDays * 86_400_000).toISOString();
    const results = this.db.run('DELETE FROM check_results WHERE checked_at < ?', cutoff);
    this.db.run('DELETE FROM notification_log WHERE sent_at < ?', cutoff);
    this.db.run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
    if (results.changes) this.log.info({ deleted: results.changes }, 'old check results purged');
  }
}
