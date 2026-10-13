import type { MonitorStatus } from './types';

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function duration(fromIso: string, toIso?: string | null): string {
  const s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function seconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v >= 99.995 ? '100%' : `${v.toFixed(2)}%`;
}

export function ms(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v)} ms`;
}

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: 'Up',
  down: 'Down',
  degraded: 'Degraded',
  pending: 'Pending',
  paused: 'Paused',
};

export const STATUS_COLOR: Record<MonitorStatus, string> = {
  up: 'bg-emerald-500',
  down: 'bg-rose-500',
  degraded: 'bg-amber-500',
  pending: 'bg-sky-400',
  paused: 'bg-zinc-400 dark:bg-zinc-600',
};

export const EVENT_LABEL: Record<string, string> = {
  down: 'Goes down',
  up: 'Recovers',
  degraded: 'Becomes degraded (slow)',
  cert_expiring: 'Certificate expiring',
  test: 'Test',
};
