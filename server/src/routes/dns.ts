import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, requireAdmin, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { nowIso } from '../db.js';
import { badRequest, HttpError, notFound, paramId, parse } from '../http.js';
import { OVH_ENDPOINTS, OvhClient, OvhError, type OvhCredentials, type OvhEndpoint, type OvhRecord } from '../ovh/client.js';
import { buildDnsView, monitorHost, type MonitorRef } from '../ovh/dnsView.js';
import type { MonitorRow } from '../types.js';

interface OvhAccountRow {
  project_id: number;
  endpoint: OvhEndpoint;
  application_key: string;
  secrets: string;
  zone: string;
  records: string | null;
  synced_at: string | null;
  last_error: string | null;
  updated_at: string;
}

const STALE_MS = 15 * 60_000;
const endpointSchema = z.enum(Object.keys(OVH_ENDPOINTS) as [OvhEndpoint, ...OvhEndpoint[]]);
const zoneSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$/, 'Invalid domain name');

const credsSchema = z.object({
  endpoint: endpointSchema,
  applicationKey: z.string().trim().min(1).max(128),
  // Write-only: omitted = keep the stored value.
  applicationSecret: z.string().trim().min(1).max(256).optional(),
  consumerKey: z.string().trim().min(1).max(256).optional(),
});

export function dnsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, box } = ctx;

  const loadAccount = (projectId: number) => db.get<OvhAccountRow>('SELECT * FROM ovh_accounts WHERE project_id = ?', projectId);

  function accountDto(a: OvhAccountRow | undefined) {
    if (!a) return null;
    return {
      endpoint: a.endpoint,
      applicationKey: a.application_key,
      zone: a.zone,
      secrets: { applicationSecret: true, consumerKey: true },
      syncedAt: a.synced_at,
      lastError: a.last_error,
    };
  }

  /** Merge submitted credentials with the stored ones (secrets are never sent back to clients). */
  function resolveCreds(body: z.infer<typeof credsSchema>, existing?: OvhAccountRow): OvhCredentials {
    const stored = existing ? box.decryptJson(existing.secrets) : {};
    const applicationSecret = body.applicationSecret ?? stored.applicationSecret;
    const consumerKey = body.consumerKey ?? stored.consumerKey;
    if (!applicationSecret || !consumerKey) throw badRequest('Application secret and consumer key are required');
    return { endpoint: body.endpoint, applicationKey: body.applicationKey, applicationSecret, consumerKey };
  }

  const ovhFailure = (err: unknown) =>
    err instanceof OvhError ? new HttpError(502, err.message) : err instanceof Error ? new HttpError(502, err.message) : err;

  async function sync(account: OvhAccountRow): Promise<void> {
    const secrets = box.decryptJson(account.secrets);
    const client = new OvhClient(
      {
        endpoint: account.endpoint,
        applicationKey: account.application_key,
        applicationSecret: secrets.applicationSecret ?? '',
        consumerKey: secrets.consumerKey ?? '',
      },
      ctx.ovhBaseUrl,
    );
    try {
      const records = await client.hostRecords(account.zone);
      db.run(
        'UPDATE ovh_accounts SET records = ?, synced_at = ?, last_error = NULL WHERE project_id = ?',
        JSON.stringify(records),
        nowIso(),
        account.project_id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.run('UPDATE ovh_accounts SET last_error = ?, synced_at = ? WHERE project_id = ?', message.slice(0, 500), nowIso(), account.project_id);
    }
  }

  function view(projectId: number) {
    const account = loadAccount(projectId)!;
    const records = account.records ? (JSON.parse(account.records) as OvhRecord[]) : [];
    const monitors: MonitorRef[] = db
      .all<MonitorRow>('SELECT * FROM monitors WHERE project_id = ?', projectId)
      .flatMap((m) => {
        const host = monitorHost(m.type, JSON.parse(m.config));
        return host ? [{ id: m.id, name: m.name, type: m.type, status: m.status, enabled: Boolean(m.enabled), host }] : [];
      });
    return {
      zone: account.zone,
      syncedAt: account.synced_at,
      error: account.last_error,
      hasRecords: account.records !== null,
      ...buildDnsView(account.zone, records, monitors),
    };
  }

  // ---- Configuration (admins) --------------------------------------------

  app.get('/api/ovh/endpoints', async () =>
    Object.entries(OVH_ENDPOINTS).map(([value, e]) => ({ value, label: e.label, url: e.url })),
  );

  app.get('/api/projects/:id/ovh', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    return { account: accountDto(loadAccount(projectId)) };
  });

  /** List the zones visible with the given (or stored) credentials, to pick the monitored domain. */
  app.post('/api/projects/:id/ovh/zones', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    requireAdmin(req);
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'edit');
    const body = parse(credsSchema, req.body);
    const creds = resolveCreds(body, loadAccount(projectId));
    try {
      return { zones: (await new OvhClient(creds, ctx.ovhBaseUrl).listZones()).sort() };
    } catch (err) {
      throw ovhFailure(err);
    }
  });

  app.put('/api/projects/:id/ovh', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    requireAdmin(req);
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'edit');
    const body = parse(credsSchema.extend({ zone: zoneSchema }), req.body);
    const existing = loadAccount(projectId);
    const creds = resolveCreds(body, existing);
    // Validate credentials and zone access before saving.
    try {
      await new OvhClient(creds, ctx.ovhBaseUrl).get(`/domain/zone/${encodeURIComponent(body.zone)}`);
    } catch (err) {
      throw ovhFailure(err);
    }
    const secrets = box.encrypt(JSON.stringify({ applicationSecret: creds.applicationSecret, consumerKey: creds.consumerKey }));
    const zoneChanged = !existing || existing.zone !== body.zone || existing.endpoint !== body.endpoint;
    db.run(
      `INSERT INTO ovh_accounts (project_id, endpoint, application_key, secrets, zone) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (project_id) DO UPDATE SET endpoint = excluded.endpoint, application_key = excluded.application_key,
         secrets = excluded.secrets, zone = excluded.zone, updated_at = ?,
         records = CASE WHEN ? THEN NULL ELSE records END, synced_at = CASE WHEN ? THEN NULL ELSE synced_at END`,
      projectId,
      body.endpoint,
      body.applicationKey,
      secrets,
      body.zone,
      nowIso(),
      zoneChanged ? 1 : 0,
      zoneChanged ? 1 : 0,
    );
    audit(db, req, 'ovh.update', `${projectId}:${body.zone}`);
    await sync(loadAccount(projectId)!);
    return { account: accountDto(loadAccount(projectId)) };
  });

  app.delete('/api/projects/:id/ovh', async (req) => {
    requireAdmin(req);
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'edit');
    if (!loadAccount(projectId)) throw notFound('OVH account');
    db.run('DELETE FROM ovh_accounts WHERE project_id = ?', projectId);
    audit(db, req, 'ovh.delete', String(projectId));
    return { ok: true };
  });

  // ---- DNS view (project members) ------------------------------------------

  app.get('/api/projects/:id/dns', async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    const account = loadAccount(projectId);
    if (!account) throw notFound('OVH account');
    // Refresh the cached zone when it is stale; monitor states are always live.
    if (!account.synced_at || Date.now() - Date.parse(account.synced_at) > STALE_MS) await sync(account);
    return view(projectId);
  });

  app.post('/api/projects/:id/dns/sync', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const projectId = paramId(req);
    requireProject(db, req, projectId, 'view');
    const account = loadAccount(projectId);
    if (!account) throw notFound('OVH account');
    await sync(account);
    return view(projectId);
  });
}
