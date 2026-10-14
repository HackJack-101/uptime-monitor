import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Activity, ChevronDown, ChevronUp, CircleCheck, CircleX, Clock, FolderKanban, Gauge, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MonitorList } from '../components/MonitorList';
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, PageLoader, QueryError } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { duration, ms, pct, timeAgo } from '../lib/format';
import type { Incident, Monitor, MonitorStatus } from '../lib/types';

interface DashboardData {
  statusCounts: Partial<Record<MonitorStatus, number>>;
  uptime24h: number | null;
  avgLatency24h: number | null;
  projectCount: number;
  incidents: Incident[];
  incidentWindowDays: number;
}

/** Resolved incidents shown before "Show more" (ongoing ones are always listed). */
const RESOLVED_PREVIEW = 5;

function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className={clsx('flex size-8 items-center justify-center rounded-lg', tone)}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [filter, setFilter] = useState<'all' | 'problems'>('all');
  const [search, setSearch] = useState('');
  const [allIncidents, setAllIncidents] = useState(false);
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/api/dashboard'), refetchInterval: 15_000 });
  const monitors = useQuery({ queryKey: ['monitors', 'all'], queryFn: () => api.get<{ monitors: Monitor[] }>('/api/monitors').then((r) => r.monitors), refetchInterval: 15_000 });

  const shown = useMemo(() => {
    let list = monitors.data ?? [];
    if (filter === 'problems') list = list.filter((m) => m.status === 'down' || m.status === 'degraded');
    if (search) list = list.filter((m) => `${m.name} ${m.project?.name}`.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
  }, [monitors.data, filter, search]);

  if (dashboard.isLoading || monitors.isLoading) return <PageLoader />;
  if (!dashboard.data || !monitors.data) {
    return (
      <QueryError
        error={dashboard.error ?? monitors.error}
        onRetry={() => {
          void dashboard.refetch();
          void monitors.refetch();
        }}
      />
    );
  }
  const d = dashboard.data;
  const c = d.statusCounts;
  const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
  const problems = (c.down ?? 0) + (c.degraded ?? 0);
  const ongoing = d.incidents.filter((i) => !i.resolved_at);
  const resolved = d.incidents.filter((i) => i.resolved_at);
  const visibleResolved = allIncidents ? resolved : resolved.slice(0, RESOLVED_PREVIEW);

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0]}`}
        description={
          total === 0 ? 'Nothing is monitored yet.' : problems === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="size-4" /> All systems operational
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <TriangleAlert className="size-4" /> {problems} service{problems > 1 ? 's' : ''} need{problems > 1 ? '' : 's'} attention
            </span>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Up" value={`${c.up ?? 0}/${total}`} icon={<CircleCheck className="size-4" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
        <Stat label="Down / degraded" value={`${c.down ?? 0} / ${c.degraded ?? 0}`} icon={<CircleX className="size-4" />} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" />
        <Stat label="Uptime 24h" value={pct(d.uptime24h)} icon={<Activity className="size-4" />} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400" />
        <Stat label="Response 24h" value={ms(d.avgLatency24h)} icon={<Gauge className="size-4" />} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5 dark:border-zinc-800/80">
            <h3 className="flex-1 text-sm font-semibold">Monitors</h3>
            <div className="flex gap-2">
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 sm:w-48" />
              <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
                {(['all', 'problems'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={clsx('rounded-md px-2.5 py-1 capitalize', filter === f ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500')}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {total === 0 ? (
            <EmptyState
              icon={<FolderKanban className="size-5" />}
              title="No monitors yet"
              description={isAdmin ? 'Create a project, then add your first web service to monitor.' : 'Ask an admin to assign you to a project.'}
              action={
                isAdmin && (
                  <Link to="/projects">
                    <Button variant="primary">Go to projects</Button>
                  </Link>
                )
              }
            />
          ) : shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No monitor matches.</p>
          ) : (
            <MonitorList monitors={shown} showProject />
          )}
        </Card>

        <Card className="flex flex-col self-start overflow-hidden">
          <CardHeader
            title="Recent incidents"
            description={`Ongoing and resolved in the last ${d.incidentWindowDays} days`}
            actions={ongoing.length > 0 && <Badge tone="red">{ongoing.length} ongoing</Badge>}
          />
          {d.incidents.length === 0 ? (
            <EmptyState icon={<CircleCheck className="size-5" />} title="No incidents" description={`Nothing in the last ${d.incidentWindowDays} days.`} />
          ) : (
            <>
              <ul className={clsx('divide-y divide-zinc-100 dark:divide-zinc-800/80', allIncidents && 'max-h-[32rem] overflow-y-auto')}>
                {[...ongoing, ...visibleResolved].map((i) => (
                  <li key={i.id}>
                    <Link to={`/monitors/${i.monitor_id}`} className="block px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{i.monitor_name}</span>
                        {i.resolved_at ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Resolved</span>
                        ) : (
                          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Ongoing</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{i.cause}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
                        <Clock className="size-3" /> {timeAgo(i.started_at)} · lasted {duration(i.started_at, i.resolved_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              {resolved.length > RESOLVED_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setAllIncidents((v) => !v)}
                  className="flex w-full items-center justify-center gap-1 border-t border-zinc-100 px-5 py-3 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-800/80 dark:hover:bg-zinc-800/30 dark:hover:text-zinc-300"
                >
                  {allIncidents ? (
                    <>
                      Show less <ChevronUp className="size-3.5" />
                    </>
                  ) : (
                    <>
                      Show {resolved.length - RESOLVED_PREVIEW} more <ChevronDown className="size-3.5" />
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function rank(s: MonitorStatus) {
  return { down: 0, degraded: 1, pending: 2, up: 3, paused: 4 }[s];
}
