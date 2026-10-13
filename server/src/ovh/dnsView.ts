import type { MonitorStatus } from '../types.js';
import type { OvhRecord } from './client.js';

export type HostState = 'running' | 'degraded' | 'error' | 'pending' | 'paused' | 'unmonitored';

export interface MonitorRef {
  id: number;
  name: string;
  type: string;
  status: MonitorStatus;
  enabled: boolean;
  host: string;
}

export interface DnsEntry {
  fqdn: string;
  subDomain: string;
  records: { type: string; target: string; ttl: number }[];
  monitors: Omit<MonitorRef, 'host'>[];
  state: HostState;
}

export interface OrphanHost {
  fqdn: string;
  monitors: Omit<MonitorRef, 'host'>[];
  state: HostState;
}

export interface DnsView {
  entries: DnsEntry[];
  orphans: OrphanHost[];
  summary: Record<HostState, number> & { missingRecord: number };
}

const normalize = (h: string) => h.trim().toLowerCase().replace(/\.$/, '');

/** Hostname targeted by a monitor, whatever its type. */
export function monitorHost(type: string, config: Record<string, unknown>): string | null {
  try {
    if (type === 'http') return normalize(new URL(String(config.url)).hostname);
    if (type === 'dns') return config.hostname ? normalize(String(config.hostname)) : null;
    return config.host ? normalize(String(config.host)) : null;
  } catch {
    return null;
  }
}

/** Aggregate the state of a host from the monitors targeting it (worst status wins). */
export function hostState(monitors: { status: MonitorStatus; enabled: boolean }[]): HostState {
  if (monitors.length === 0) return 'unmonitored';
  const active = monitors.filter((m) => m.enabled && m.status !== 'paused');
  if (active.length === 0) return 'paused';
  if (active.some((m) => m.status === 'down')) return 'error';
  if (active.some((m) => m.status === 'degraded')) return 'degraded';
  if (active.some((m) => m.status === 'pending')) return 'pending';
  return 'running';
}

export function buildDnsView(zone: string, records: OvhRecord[], monitors: MonitorRef[]): DnsView {
  const z = normalize(zone);
  const strip = ({ host: _, ...m }: MonitorRef) => m;

  const byHost = new Map<string, DnsEntry>();
  for (const r of records) {
    const sub = normalize(r.subDomain);
    const fqdn = sub ? `${sub}.${z}` : z;
    const entry = byHost.get(fqdn) ?? { fqdn, subDomain: sub, records: [], monitors: [], state: 'unmonitored' as HostState };
    entry.records.push({ type: r.fieldType, target: r.target, ttl: r.ttl });
    byHost.set(fqdn, entry);
  }

  // "*.apps.zone" resolves "x.apps.zone" (one label only), so monitors on such hosts belong to the wildcard row.
  const wildcardFor = (host: string) => {
    const dot = host.indexOf('.');
    return dot > 0 ? byHost.get(`*${host.slice(dot)}`) : undefined;
  };

  const orphanMap = new Map<string, MonitorRef[]>();
  for (const m of monitors) {
    const entry = byHost.get(m.host) ?? wildcardFor(m.host);
    if (entry) entry.monitors.push(strip(m));
    else if (m.host === z || m.host.endsWith(`.${z}`)) orphanMap.set(m.host, [...(orphanMap.get(m.host) ?? []), m]);
  }

  const entries = [...byHost.values()]
    .map((e) => ({ ...e, state: hostState(e.monitors) }))
    .sort((a, b) => (a.fqdn === z ? -1 : b.fqdn === z ? 1 : a.fqdn.localeCompare(b.fqdn)));

  const orphans = [...orphanMap.entries()]
    .map(([fqdn, ms]) => ({ fqdn, monitors: ms.map(strip), state: hostState(ms) }))
    .sort((a, b) => a.fqdn.localeCompare(b.fqdn));

  const summary = { running: 0, degraded: 0, error: 0, pending: 0, paused: 0, unmonitored: 0, missingRecord: 0 };
  for (const e of entries) summary[e.state]++;
  summary.missingRecord = orphans.length;
  return { entries, orphans, summary };
}
