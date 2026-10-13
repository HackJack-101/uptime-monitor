import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pause, Pencil, Play, RefreshCw, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { HeartbeatBar, LatencyChart } from '../components/charts';
import { RulesPanel } from '../components/NotificationPanels';
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, PageLoader, StatusBadge, Tabs, useToast } from '../components/ui';
import { useMeta } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import { dateTime, duration, ms, pct, seconds, STATUS_COLOR, timeAgo } from '../lib/format';
import { monitorQuery } from '../lib/queries';
import type { Heartbeat, Incident, Monitor, MonitorStatus } from '../lib/types';
import { BackLink } from './ProjectDetail';

const RANGES = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

function target(m: Monitor): string {
  const c = m.config as Record<string, string | number>;
  switch (m.type) {
    case 'http':
      return `${c.method ?? 'GET'} ${c.url}`;
    case 'dns':
      return `${c.recordType} ${c.hostname}`;
    case 'ssh':
      return `${c.username}@${c.host}:${c.port ?? 22}`;
    case 'tcp':
    case 'tls':
      return `${c.host}:${c.port}`;
    default:
      return String(c.host ?? '');
  }
}

export function MonitorDetailPage() {
  const id = Number(useParams().monitorId);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const meta = useMeta();
  const [range, setRange] = useState(24);
  const [tab, setTab] = useState<'overview' | 'notifications'>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = useQuery({ ...monitorQuery(id), refetchInterval: 15_000 });
  const results = useQuery({
    queryKey: ['monitor', id, 'results', range],
    queryFn: () => api.get<{ results: Heartbeat[]; latest: Heartbeat[] }>(`/api/monitors/${id}/results?hours=${range}`),
    refetchInterval: 30_000,
  });
  const incidents = useQuery({
    queryKey: ['monitor', id, 'incidents'],
    queryFn: () => api.get<{ incidents: Incident[] }>(`/api/monitors/${id}/incidents`).then((r) => r.incidents),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['monitor', id] });
    qc.invalidateQueries({ queryKey: ['monitors'] });
  };
  const checkNow = useMutation({
    mutationFn: () => api.post<{ result: { status: MonitorStatus; message: string } }>(`/api/monitors/${id}/check`),
    onSuccess: (r) => {
      invalidate();
      toast(`Check finished: ${r.result.status.toUpperCase()} — ${r.result.message}`, r.result.status === 'down' ? 'error' : 'success');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/api/monitors/${id}`, { enabled }),
    onSuccess: (_, enabled) => {
      invalidate();
      toast(enabled ? 'Monitor resumed' : 'Monitor paused');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/monitors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast('Monitor deleted');
      navigate(`/projects/${detail.data?.monitor.project_id}`);
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (detail.isLoading) return <PageLoader />;
  if (!detail.data) return <EmptyState icon={<Server className="size-5" />} title="Monitor not found" />;
  const { monitor: m, stats } = detail.data;
  const canEdit = m.access === 'edit';
  const eff = m.effective!;
  const typeLabel = meta.data?.monitorTypes.find((t) => t.type === m.type)?.label ?? m.type;

  return (
    <>
      <PageHeader
        back={<BackLink to={`/projects/${m.project_id}`}>{m.project?.name ?? 'Project'}</BackLink>}
        title={
          <span className="flex items-center gap-3">
            {m.name} <StatusBadge status={m.status} />
          </span>
        }
        description={
          <span className="font-mono text-xs break-all">
            {typeLabel} · {target(m)}
          </span>
        }
        actions={
          canEdit && (
            <>
              <Button icon={<RefreshCw className={clsx('size-4', checkNow.isPending && 'animate-spin')} />} onClick={() => checkNow.mutate()} disabled={checkNow.isPending}>
                Check now
              </Button>
              <Button icon={m.enabled ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => toggle.mutate(!m.enabled)} loading={toggle.isPending}>
                {m.enabled ? 'Pause' : 'Resume'}
              </Button>
              <Link to={`/monitors/${m.id}/edit`}>
                <Button icon={<Pencil className="size-4" />}>Edit</Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete monitor">
                <Trash2 className="size-4" />
              </Button>
            </>
          )
        }
      />

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'notifications', label: 'Notifications' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'notifications' ? (
        <RulesPanel projectId={m.project_id} monitorId={m.id} canEdit={canEdit} inheritProject={m.inherit_notifications} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              { label: 'Response', value: ms(m.last_latency_ms), sub: `checked ${timeAgo(m.last_check_at)}` },
              { label: 'Uptime 24h', value: pct(stats['24h']?.uptime), sub: `avg ${ms(stats['24h']?.avg_latency)}` },
              { label: 'Uptime 7d', value: pct(stats['7d']?.uptime), sub: `avg ${ms(stats['7d']?.avg_latency)}` },
              { label: 'Uptime 30d', value: pct(stats['30d']?.uptime), sub: `${stats['30d']?.checks ?? 0} checks` },
            ].map((s) => (
              <Card key={s.label} className="p-4 sm:p-5">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{s.label}</div>
                <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{s.value}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{s.sub}</div>
              </Card>
            ))}
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800/80">
              <h3 className="text-sm font-semibold">Response time</h3>
              <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
                {RANGES.map((r) => (
                  <button
                    key={r.hours}
                    type="button"
                    onClick={() => setRange(r.hours)}
                    className={clsx('rounded-md px-2.5 py-1', range === r.hours ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500')}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 sm:p-5">
              {results.isLoading ? <PageLoader /> : <LatencyChart points={results.data?.results ?? []} />}
              <HeartbeatBar beats={results.data?.results ?? []} slots={60} className="mt-4 h-6" />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Current status" />
              <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/80">
                {[
                  ['Last message', m.last_message ?? '—'],
                  ['Status since', m.status_changed_at ? `${dateTime(m.status_changed_at)} (${duration(m.status_changed_at)})` : '—'],
                  ['Check interval', `${seconds(eff.intervalS)}${m.interval_s === null ? ' (inherited)' : ''}`],
                  ['Timeout', `${seconds(eff.timeoutS)}${m.timeout_s === null ? ' (inherited)' : ''}`],
                  ['Retries', `${eff.retries} every ${seconds(eff.retryIntervalS)}`],
                  ['Degraded above', eff.degradedThresholdMs ? `${eff.degradedThresholdMs} ms` : 'Disabled'],
                  ...(m.cert_days_remaining !== null
                    ? [[
                        'TLS certificate',
                        <span key="c" className={clsx('inline-flex items-center gap-1', m.cert_days_remaining < 14 ? 'text-amber-600' : 'text-emerald-600')}>
                          <ShieldCheck className="size-3.5" /> expires in {m.cert_days_remaining} days
                        </span>,
                      ]]
                    : []),
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-4 px-5 py-2.5">
                    <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
                    <dd className="text-right break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <CardHeader title="Incidents" />
              {!incidents.data?.length ? (
                <p className="px-5 py-10 text-center text-sm text-zinc-500">No incident recorded. 🎉</p>
              ) : (
                <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/80">
                  {incidents.data.map((i) => (
                    <li key={i.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{dateTime(i.started_at)}</span>
                        <span className={clsx('text-xs font-medium', i.resolved_at ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                          {i.resolved_at ? `Resolved after ${duration(i.started_at, i.resolved_at)}` : `Ongoing · ${duration(i.started_at)}`}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{i.cause}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Latest checks" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400">
                    <th className="px-5 py-2 font-medium">Time</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 text-right font-medium">Response</th>
                    <th className="hidden px-5 py-2 font-medium sm:table-cell">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {(results.data?.latest ?? []).map((r, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2 whitespace-nowrap text-zinc-500">{dateTime(r.checked_at)}</td>
                      <td className="px-5 py-2">
                        <span className="inline-flex items-center gap-2 capitalize">
                          <span className={clsx('size-2 rounded-full', STATUS_COLOR[r.status])} />
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">{ms(r.latency_ms)}</td>
                      <td className="hidden max-w-md truncate px-5 py-2 text-zinc-500 sm:table-cell">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${m.name}?`}
        message="All its history, incidents and specific rules will be deleted."
      />
    </>
  );
}
