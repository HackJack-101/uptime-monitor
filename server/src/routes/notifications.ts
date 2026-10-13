import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { nowIso } from '../db.js';
import { badRequest, notFound, paramId, parse } from '../http.js';
import { getChannelType } from '../registry/channels.js';
import { mergeSecrets, parsePayload, secretPresence } from '../registry/fields.js';
import { RULE_EVENTS, type ChannelRow, type ProjectRow, type RuleRow } from '../types.js';

const channelSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.unknown()).default({}),
});

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  monitor_id: z.number().int().positive().nullable().default(null),
  enabled: z.boolean().default(true),
  events: z.array(z.enum(RULE_EVENTS)).min(1, 'Select at least one event'),
  failure_threshold: z.number().int().min(1).max(100).default(1),
  reminder_interval_min: z.number().int().min(0).max(10080).default(0),
  channel_ids: z.array(z.number().int().positive()).min(1, 'Select at least one channel').max(50),
});

export function notificationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, box, notifier } = ctx;

  function channelDto(c: ChannelRow) {
    const def = getChannelType(c.type);
    let secrets: Record<string, string> = {};
    try {
      secrets = box.decryptJson(c.secrets);
    } catch {
      /* reported as unset */
    }
    const { secrets: _s, ...rest } = c;
    return { ...rest, enabled: Boolean(c.enabled), config: JSON.parse(c.config), secrets: def ? secretPresence(def, secrets) : {} };
  }

  function ruleDto(r: RuleRow) {
    const channels = db.all<{ channel_id: number }>('SELECT channel_id FROM notification_rule_channels WHERE rule_id = ?', r.id);
    return { ...r, enabled: Boolean(r.enabled), events: JSON.parse(r.events), channel_ids: channels.map((c) => c.channel_id) };
  }

  function loadChannel(req: FastifyRequest, need: 'view' | 'edit') {
    const channel = db.get<ChannelRow>('SELECT * FROM notification_channels WHERE id = ?', paramId(req));
    if (!channel) throw notFound('Channel');
    requireProject(db, req, channel.project_id, need);
    return channel;
  }

  function loadRule(req: FastifyRequest, need: 'view' | 'edit') {
    const rule = db.get<RuleRow>('SELECT * FROM notification_rules WHERE id = ?', paramId(req));
    if (!rule) throw notFound('Rule');
    requireProject(db, req, rule.project_id, need);
    return rule;
  }

  function validateRuleRefs(projectId: number, monitorId: number | null, channelIds: number[]) {
    if (monitorId !== null && !db.get('SELECT 1 FROM monitors WHERE id = ? AND project_id = ?', monitorId, projectId)) {
      throw badRequest('The monitor does not belong to this project');
    }
    for (const id of channelIds) {
      if (!db.get('SELECT 1 FROM notification_channels WHERE id = ? AND project_id = ?', id, projectId)) {
        throw badRequest('A selected channel does not belong to this project');
      }
    }
  }

  function setRuleChannels(ruleId: number, channelIds: number[]) {
    db.run('DELETE FROM notification_rule_channels WHERE rule_id = ?', ruleId);
    for (const id of new Set(channelIds)) db.run('INSERT INTO notification_rule_channels (rule_id, channel_id) VALUES (?, ?)', ruleId, id);
  }

  // ---- Channels ----------------------------------------------------------

  app.get('/api/projects/:id/channels', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    const rows = db.all<ChannelRow>('SELECT * FROM notification_channels WHERE project_id = ? ORDER BY name COLLATE NOCASE', projectId);
    return { channels: rows.map(channelDto) };
  });

  app.post('/api/projects/:id/channels', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'edit');
    const body = parse(channelSchema, req.body);
    const def = getChannelType(body.type);
    if (!def) throw badRequest(`Unknown channel type: ${body.type}`);
    const payload = parsePayload(def, body.config, body.secrets);
    if (!payload.ok) throw badRequest('Invalid channel configuration', payload.errors);
    const { lastInsertRowid } = db.run(
      'INSERT INTO notification_channels (project_id, name, type, enabled, config, secrets) VALUES (?, ?, ?, ?, ?, ?)',
      projectId,
      body.name,
      body.type,
      Number(body.enabled),
      JSON.stringify(payload.value.config),
      box.encryptJson(mergeSecrets({}, payload.value.secrets)),
    );
    audit(db, req, 'channel.create', `${lastInsertRowid}:${body.name}`);
    return { channel: channelDto(db.get<ChannelRow>('SELECT * FROM notification_channels WHERE id = ?', lastInsertRowid)!) };
  });

  app.patch('/api/channels/:id', async (req) => {
    const channel = loadChannel(req, 'edit');
    const body = parse(channelSchema.omit({ type: true }).partial(), req.body);
    const def = getChannelType(channel.type)!;
    const existing = box.decryptJson(channel.secrets);
    const payload = parsePayload(def, body.config ?? JSON.parse(channel.config), body.secrets ?? {}, new Set(Object.keys(existing)));
    if (!payload.ok) throw badRequest('Invalid channel configuration', payload.errors);
    db.run(
      'UPDATE notification_channels SET name = ?, enabled = ?, config = ?, secrets = ?, updated_at = ? WHERE id = ?',
      body.name ?? channel.name,
      Number(body.enabled ?? Boolean(channel.enabled)),
      JSON.stringify(payload.value.config),
      box.encryptJson(mergeSecrets(existing, payload.value.secrets)),
      nowIso(),
      channel.id,
    );
    audit(db, req, 'channel.update', `${channel.id}:${body.name ?? channel.name}`);
    return { channel: channelDto(db.get<ChannelRow>('SELECT * FROM notification_channels WHERE id = ?', channel.id)!) };
  });

  app.delete('/api/channels/:id', async (req) => {
    const channel = loadChannel(req, 'edit');
    db.run('DELETE FROM notification_channels WHERE id = ?', channel.id);
    audit(db, req, 'channel.delete', `${channel.id}:${channel.name}`);
    return { ok: true };
  });

  app.post('/api/channels/:id/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const channel = loadChannel(req, 'edit');
    const project = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', channel.project_id)!;
    return notifier.sendTest(channel, project.name);
  });

  app.get('/api/projects/:id/notification-log', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    const entries = db.all(
      `SELECT l.*, c.name AS channel_name, c.type AS channel_type, m.name AS monitor_name
       FROM notification_log l
       LEFT JOIN notification_channels c ON c.id = l.channel_id
       LEFT JOIN monitors m ON m.id = l.monitor_id
       WHERE l.project_id = ? ORDER BY l.id DESC LIMIT 100`,
      projectId,
    );
    return { entries };
  });

  // ---- Rules ---------------------------------------------------------------

  app.get('/api/projects/:id/rules', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    const q = parse(z.object({ monitorId: z.coerce.number().int().positive().optional() }), req.query);
    const rows = q.monitorId
      ? db.all<RuleRow>(
          'SELECT * FROM notification_rules WHERE project_id = ? AND (monitor_id = ? OR monitor_id IS NULL) ORDER BY monitor_id IS NOT NULL, name',
          projectId,
          q.monitorId,
        )
      : db.all<RuleRow>('SELECT * FROM notification_rules WHERE project_id = ? ORDER BY monitor_id IS NOT NULL, name', projectId);
    return { rules: rows.map(ruleDto) };
  });

  app.post('/api/projects/:id/rules', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'edit');
    const body = parse(ruleSchema, req.body);
    validateRuleRefs(projectId, body.monitor_id, body.channel_ids);
    const id = db.transaction(() => {
      const { lastInsertRowid } = db.run(
        `INSERT INTO notification_rules (project_id, monitor_id, name, enabled, events, failure_threshold, reminder_interval_min)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        projectId,
        body.monitor_id,
        body.name,
        Number(body.enabled),
        JSON.stringify(body.events),
        body.failure_threshold,
        body.reminder_interval_min,
      );
      setRuleChannels(lastInsertRowid, body.channel_ids);
      return lastInsertRowid;
    });
    audit(db, req, 'rule.create', `${id}:${body.name}`);
    return { rule: ruleDto(db.get<RuleRow>('SELECT * FROM notification_rules WHERE id = ?', id)!) };
  });

  app.patch('/api/rules/:id', async (req) => {
    const rule = loadRule(req, 'edit');
    const body = parse(ruleSchema.omit({ monitor_id: true }).partial(), req.body);
    if (body.channel_ids) validateRuleRefs(rule.project_id, null, body.channel_ids);
    db.transaction(() => {
      db.run(
        `UPDATE notification_rules SET name = ?, enabled = ?, events = ?, failure_threshold = ?, reminder_interval_min = ?, updated_at = ?
         WHERE id = ?`,
        body.name ?? rule.name,
        Number(body.enabled ?? Boolean(rule.enabled)),
        body.events ? JSON.stringify(body.events) : rule.events,
        body.failure_threshold ?? rule.failure_threshold,
        body.reminder_interval_min ?? rule.reminder_interval_min,
        nowIso(),
        rule.id,
      );
      if (body.channel_ids) setRuleChannels(rule.id, body.channel_ids);
    });
    audit(db, req, 'rule.update', `${rule.id}:${body.name ?? rule.name}`);
    return { rule: ruleDto(db.get<RuleRow>('SELECT * FROM notification_rules WHERE id = ?', rule.id)!) };
  });

  app.delete('/api/rules/:id', async (req) => {
    const rule = loadRule(req, 'edit');
    db.run('DELETE FROM notification_rules WHERE id = ?', rule.id);
    audit(db, req, 'rule.delete', `${rule.id}:${rule.name}`);
    return { ok: true };
  });
}
