import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import type { SecretBox } from '../crypto.js';
import { nowIso, type Database } from '../db.js';
import type { ChannelRow, MonitorRow, MonitorStatus, ProjectRow, RuleEvent, RuleRow } from '../types.js';
import { sendNotification, type EventKind, type NotificationMessage } from './senders.js';

interface StateRow {
  last_event: string | null;
  last_sent_at: string | null;
  cert_sent_at: string | null;
}

export interface CheckTransition {
  monitor: MonitorRow;
  project: ProjectRow;
  previous: MonitorStatus;
  current: MonitorStatus;
  /** Number of consecutive checks that confirmed DOWN (after retries). */
  downChecks: number;
  certDaysRemaining?: number;
  certThresholdDays?: number;
  message: string;
}

const CERT_REMINDER_MS = 24 * 3600 * 1000;

export function monitorUrl(monitorId: number): string | undefined {
  return config.publicUrl ? `${config.publicUrl}/monitors/${monitorId}` : undefined;
}

/** Decide which events a single rule should emit for a transition. Pure function — easy to test. */
export function decideEvents(rule: Pick<RuleRow, 'failure_threshold' | 'reminder_interval_min'> & { events: RuleEvent[] }, state: StateRow | undefined, t: CheckTransition, now = Date.now()): {
  send: EventKind[];
  lastEvent: string | null;
  certSent: boolean;
} {
  const send: EventKind[] = [];
  let lastEvent = state?.last_event ?? null;
  let certSent = false;
  const wants = (e: RuleEvent) => rule.events.includes(e);

  if (t.current === 'down') {
    if (t.downChecks >= rule.failure_threshold) {
      if (lastEvent !== 'down') {
        if (wants('down')) send.push('down');
        lastEvent = 'down';
      } else if (wants('down') && rule.reminder_interval_min > 0 && state?.last_sent_at) {
        if (now - Date.parse(state.last_sent_at) >= rule.reminder_interval_min * 60_000) send.push('down');
      }
    }
  } else if (t.current === 'up' || t.current === 'degraded') {
    if (lastEvent === 'down' || (lastEvent === 'degraded' && t.current === 'up')) {
      if (wants('up')) send.push('up');
      lastEvent = 'up';
    }
    if (t.current === 'degraded' && lastEvent !== 'degraded') {
      if (wants('degraded')) send.push('degraded');
      lastEvent = 'degraded';
    }
  }

  if (
    wants('cert_expiring') &&
    t.certDaysRemaining !== undefined &&
    t.certThresholdDays &&
    t.certDaysRemaining < t.certThresholdDays &&
    (!state?.cert_sent_at || now - Date.parse(state.cert_sent_at) >= CERT_REMINDER_MS)
  ) {
    send.push('cert_expiring');
    certSent = true;
  }
  return { send, lastEvent, certSent };
}

function buildMessage(event: EventKind, t: CheckTransition): NotificationMessage {
  const m = t.monitor;
  const titles: Record<EventKind, string> = {
    down: `${m.name} is DOWN`,
    up: `${m.name} is back UP`,
    degraded: `${m.name} is DEGRADED`,
    cert_expiring: `${m.name}: certificate expires in ${t.certDaysRemaining} day(s)`,
    test: 'Test notification',
  };
  return {
    event,
    title: titles[event],
    text: `Project: ${t.project.name}\nMonitor: ${m.name} (${m.type})\nStatus: ${t.current.toUpperCase()}\nDetails: ${t.message}`,
    monitor: { id: m.id, name: m.name, type: m.type, status: t.current },
    project: { id: t.project.id, name: t.project.name },
    url: monitorUrl(m.id),
    timestamp: nowIso(),
  };
}

export class NotificationEngine {
  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Rules that apply to a monitor: its own rules, plus project-wide rules when inheritance is enabled. */
  applicableRules(monitor: MonitorRow): RuleRow[] {
    return this.db.all<RuleRow>(
      `SELECT * FROM notification_rules
       WHERE enabled = 1 AND project_id = ? AND (monitor_id = ? OR (monitor_id IS NULL AND ? = 1))`,
      monitor.project_id,
      monitor.id,
      monitor.inherit_notifications,
    );
  }

  async handle(t: CheckTransition): Promise<void> {
    if (t.current === 'pending' || t.current === 'paused') return;
    const deliveries = new Map<string, { channel: ChannelRow; event: EventKind }>();

    for (const rule of this.applicableRules(t.monitor)) {
      const state = this.db.get<StateRow>(
        'SELECT last_event, last_sent_at, cert_sent_at FROM notification_state WHERE rule_id = ? AND monitor_id = ?',
        rule.id,
        t.monitor.id,
      );
      const events = JSON.parse(rule.events) as RuleEvent[];
      const decision = decideEvents({ ...rule, events }, state, t);
      const now = nowIso();
      const sentMain = decision.send.some((e) => e !== 'cert_expiring');
      this.db.run(
        `INSERT INTO notification_state (rule_id, monitor_id, last_event, last_sent_at, cert_sent_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (rule_id, monitor_id) DO UPDATE SET
           last_event = excluded.last_event,
           last_sent_at = COALESCE(excluded.last_sent_at, notification_state.last_sent_at),
           cert_sent_at = COALESCE(excluded.cert_sent_at, notification_state.cert_sent_at)`,
        rule.id,
        t.monitor.id,
        decision.lastEvent,
        sentMain ? now : null,
        decision.certSent ? now : null,
      );
      if (decision.send.length === 0) continue;

      const channels = this.db.all<ChannelRow>(
        `SELECT c.* FROM notification_channels c
         JOIN notification_rule_channels rc ON rc.channel_id = c.id
         WHERE rc.rule_id = ? AND c.enabled = 1`,
        rule.id,
      );
      for (const event of decision.send) {
        for (const channel of channels) deliveries.set(`${channel.id}:${event}`, { channel, event });
      }
    }

    await Promise.all([...deliveries.values()].map(({ channel, event }) => this.deliver(channel, buildMessage(event, t))));
  }

  async deliver(channel: ChannelRow, message: NotificationMessage): Promise<{ ok: boolean; error?: string }> {
    let error: string | undefined;
    try {
      await sendNotification(
        { type: channel.type, config: JSON.parse(channel.config), secrets: this.box.decryptJson(channel.secrets) },
        message,
      );
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      this.log.warn({ channelId: channel.id, event: message.event, err: error }, 'notification delivery failed');
    }
    this.db.run(
      'INSERT INTO notification_log (project_id, monitor_id, channel_id, event, success, error) VALUES (?, ?, ?, ?, ?, ?)',
      channel.project_id,
      message.monitor?.id ?? null,
      channel.id,
      message.event,
      error ? 0 : 1,
      error ?? null,
    );
    return error ? { ok: false, error } : { ok: true };
  }

  async sendTest(channel: ChannelRow, projectName: string): Promise<{ ok: boolean; error?: string }> {
    return this.deliver(channel, {
      event: 'test',
      title: 'Test notification',
      text: `This is a test from Uptime Monitor for channel "${channel.name}" (project ${projectName}).`,
      project: { id: channel.project_id, name: projectName },
      url: config.publicUrl || undefined,
      timestamp: nowIso(),
    });
  }
}
