import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CircleCheck, CircleDashed, CircleX, Globe, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, PageLoader, QueryError, StatusDot, useToast } from '../components/ui';
import { t, tServer } from '../i18n';
import { api, ApiError, errorText } from '../lib/api';
import { timeAgo } from '../lib/format';
import { projectQuery } from '../lib/queries';
import type { DnsEntry, DnsMonitorRef, DnsView, HostState } from '../lib/types';
import { BackLink } from './ProjectDetail';

const STATE: Record<HostState, { dot: string; tone: 'green' | 'red' | 'amber' | 'zinc' | 'brand' }> = {
  running: { dot: 'bg-emerald-500', tone: 'green' },
  degraded: { dot: 'bg-amber-500', tone: 'amber' },
  error: { dot: 'bg-rose-500', tone: 'red' },
  pending: { dot: 'bg-sky-400', tone: 'brand' },
  paused: { dot: 'bg-zinc-400', tone: 'zinc' },
  unmonitored: { dot: 'border-2 border-dashed border-zinc-300 dark:border-zinc-600', tone: 'zinc' },
};

const FILTER_LABEL = {
  all: 'dns.filterAll',
  running: 'dns.filterRunning',
  error: 'dns.filterError',
  unmonitored: 'dns.filterUnmonitored',
} as const;

type Filter = 'all' | 'running' | 'error' | 'unmonitored';

function MonitorChips({ monitors }: { monitors: DnsMonitorRef[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {monitors.map((m) => (
        <Link
          key={m.id}
          to={`/monitors/${m.id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <StatusDot status={m.status} pulse={false} className="size-1.5" />
          {m.name}
          <span className="text-[10px] text-zinc-400 uppercase">{m.type}</span>
        </Link>
      ))}
    </div>
  );
}

function newMonitorLink(projectId: number, fqdn: string) {
  const params = new URLSearchParams({ type: 'http', name: fqdn, url: `https://${fqdn}` });
  return `/projects/${projectId}/monitors/new?${params}`;
}

function EntryRow({ entry, projectId, canEdit }: { entry: DnsEntry; projectId: number; canEdit: boolean }) {
  const s = STATE[entry.state];
  const wildcard = entry.fqdn.startsWith('*.');
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-start gap-3 lg:w-2/5">
        <span className={clsx('mt-1.5 size-2.5 shrink-0 rounded-full', s.dot)} />
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-medium" title={entry.fqdn}>
            {entry.fqdn}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.records.map((r, i) => (
              <span key={i} className="inline-flex max-w-full items-center gap-1 truncate rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{r.type}</span>
                <span className="truncate">{r.target}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 pl-5.5 lg:pl-0">
        {entry.monitors.length > 0 ? (
          <MonitorChips monitors={entry.monitors} />
        ) : (
          <span className="text-xs text-zinc-400">{wildcard ? t('dns.noMonitorWildcard', entry.fqdn) : t('dns.noMonitor')}</span>
        )}
        <div className="flex items-center gap-2">
          <Badge tone={s.tone}>{t(`dns.state.${entry.state}`)}</Badge>
          {canEdit && entry.state === 'unmonitored' && !wildcard && (
            <Link to={newMonitorLink(projectId, entry.fqdn)}>
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />}>
                {t('dns.monitorIt')}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function DnsZonePage() {
  const projectId = Number(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const project = useQuery(projectQuery(projectId));
  const dns = useQuery({
    queryKey: ['dns', projectId],
    queryFn: () => api.get<DnsView>(`/api/projects/${projectId}/dns`),
    refetchInterval: 30_000, // monitor states are live; the zone itself is cached server-side
  });
  const sync = useMutation({
    mutationFn: () => api.post<DnsView>(`/api/projects/${projectId}/dns/sync`),
    onSuccess: (data) => {
      qc.setQueryData(['dns', projectId], data);
      qc.invalidateQueries({ queryKey: ['ovh', projectId] });
      if (data.error) toast(tServer(data.error), 'error');
      else toast(t('dns.refreshed'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const entries = useMemo(() => {
    let list = dns.data?.entries ?? [];
    if (filter === 'running') list = list.filter((e) => e.state === 'running' || e.state === 'degraded');
    if (filter === 'error') list = list.filter((e) => e.state === 'error');
    if (filter === 'unmonitored') list = list.filter((e) => e.state === 'unmonitored');
    if (search) list = list.filter((e) => e.fqdn.includes(search.toLowerCase()));
    return list;
  }, [dns.data, filter, search]);

  if (dns.isLoading || project.isLoading) return <PageLoader />;
  const p = project.data;
  const canEdit = p?.access === 'edit';

  if (dns.error instanceof ApiError && dns.error.status === 404) {
    return (
      <>
        <PageHeader back={<BackLink to={`/projects/${projectId}`}>{p?.name ?? t('common.project')}</BackLink>} title={t('dns.title')} />
        <Card>
          <EmptyState
            icon={<Globe className="size-5" />}
            title={t('dns.noAccount')}
            description={t('dns.noAccountHelp')}
            action={
              <Link to={`/projects/${projectId}?tab=settings`}>
                <Button variant="primary">{t('dns.openSettings')}</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }
  if (!dns.data) return <QueryError error={dns.error} onRetry={() => void dns.refetch()} />;
  const d = dns.data;
  const s = d.summary;

  const stats = [
    { label: t('dns.statRunning'), value: s.running + s.degraded, icon: <CircleCheck className="size-4" />, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', filter: 'running' as const },
    { label: t('dns.statError'), value: s.error, icon: <CircleX className="size-4" />, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', filter: 'error' as const },
    { label: t('dns.statUnmonitored'), value: s.unmonitored, icon: <CircleDashed className="size-4" />, tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400', filter: 'unmonitored' as const },
    { label: t('dns.statMissing'), value: s.missingRecord, icon: <TriangleAlert className="size-4" />, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', filter: null },
  ];

  return (
    <>
      <PageHeader
        back={<BackLink to={`/projects/${projectId}`}>{p?.name ?? t('common.project')}</BackLink>}
        title={
          <span className="flex items-center gap-3">
            <Globe className="size-6 text-zinc-400" />
            <span className="font-mono">{d.zone}</span>
          </span>
        }
        description={t('dns.subtitle', timeAgo(d.syncedAt))}
        actions={
          <Button icon={<RefreshCw className={clsx('size-4', sync.isPending && 'animate-spin')} />} onClick={() => sync.mutate()} disabled={sync.isPending}>
            {t('dns.refresh')}
          </Button>
        }
      />

      {d.error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {t('dns.syncFailed', tServer(d.error))}
            {d.hasRecords && ` ${t('dns.lastSnapshot')}`}
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((st) => (
          <button
            key={st.label}
            type="button"
            disabled={!st.filter}
            onClick={() => st.filter && setFilter(filter === st.filter ? 'all' : st.filter)}
            className="text-left disabled:cursor-default"
          >
            <Card className={clsx('h-full p-4 transition-shadow sm:p-5', st.filter && filter === st.filter && 'ring-2 ring-brand-500')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{st.label}</span>
                <span className={clsx('flex size-8 items-center justify-center rounded-lg', st.tone)}>{st.icon}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{st.value}</div>
            </Card>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5 dark:border-zinc-800/80">
          <h3 className="flex-1 text-sm font-semibold">
            {t('dns.hosts')} <span className="font-normal text-zinc-400">· {t('dns.hostsRecords')}</span>
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
              <Input placeholder={t('dns.filterHosts')} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8" />
            </div>
            <div className="no-scrollbar flex overflow-x-auto rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
              {(['all', 'running', 'error', 'unmonitored'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={clsx('rounded-md px-2.5 py-1 whitespace-nowrap', filter === f ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500')}
                >
                  {t(FILTER_LABEL[f])}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!d.hasRecords && !d.error ? (
          <EmptyState icon={<Globe className="size-5" />} title={t('dns.notLoaded')} description={t('dns.notLoadedHelp')} />
        ) : entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">{t('dns.noMatch')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {entries.map((e) => (
              <EntryRow key={e.fqdn} entry={e} projectId={projectId} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </Card>

      {d.orphans.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title={t('dns.orphansTitle')}
            description={t('dns.orphansHelp', d.zone)}
          />
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {d.orphans.map((o) => (
              <li key={o.fqdn} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 items-center gap-3 sm:w-2/5">
                  <TriangleAlert className="size-4 shrink-0 text-amber-500" />
                  <span className="truncate font-mono text-sm font-medium">{o.fqdn}</span>
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pl-7 sm:pl-0">
                  <MonitorChips monitors={o.monitors} />
                  <Badge tone="amber">{t('dns.missingRecord')}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
