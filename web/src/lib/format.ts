import { getLocale, t } from '../i18n';
import type { MonitorStatus } from './types';

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return t('time.never');
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 5) return t('time.justNow');
  if (s < 60) return t('time.secondsAgo', s);
  const m = Math.round(s / 60);
  if (m < 60) return t('time.minutesAgo', m);
  const h = Math.round(m / 60);
  if (h < 48) return t('time.hoursAgo', h);
  return t('time.daysAgo', Math.round(h / 24));
}

export function duration(fromIso: string, toIso?: string | null): string {
  const s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000));
  if (s < 60) return t('unit.s', s);
  const m = Math.floor(s / 60);
  if (m < 60) return t('unit.min', m);
  const h = Math.floor(m / 60);
  if (h < 24) return t('unit.hm', { h, m: m % 60 });
  return t('unit.dh', { d: Math.floor(h / 24), h: h % 24 });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function seconds(s: number): string {
  if (s < 60) return t('unit.s', s);
  if (s % 3600 === 0) return t('unit.h', s / 3600);
  if (s % 60 === 0) return t('unit.min', s / 60);
  return t('unit.s', s);
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v >= 99.995 ? fmtPct(100, 0) : fmtPct(v, 2);
}

export function ms(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v).toLocaleString(getLocale())} ms`;
}

function fmtPct(v: number, digits: number): string {
  return `${v.toLocaleString(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}${getLocale() === 'fr-FR' ? '\u202f' : ''}%`;
}

/** Labels follow the current language (getters, so they are read at render time). */
export const STATUS_LABEL: Record<MonitorStatus, string> = {
  get up() { return t('status.up'); },
  get down() { return t('status.down'); },
  get degraded() { return t('status.degraded'); },
  get pending() { return t('status.pending'); },
  get paused() { return t('status.paused'); },
};

export const STATUS_COLOR: Record<MonitorStatus, string> = {
  up: 'bg-emerald-500',
  down: 'bg-rose-500',
  degraded: 'bg-amber-500',
  pending: 'bg-sky-400',
  paused: 'bg-zinc-400 dark:bg-zinc-600',
};

export const EVENT_LABEL: Record<string, string> = {
  get down() { return t('event.down'); },
  get up() { return t('event.up'); },
  get degraded() { return t('event.degraded'); },
  get cert_expiring() { return t('event.cert_expiring'); },
  get test() { return t('event.test'); },
};
