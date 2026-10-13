import clsx from 'clsx';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { ms, pct, timeAgo } from '../lib/format';
import type { Monitor } from '../lib/types';
import { HeartbeatBar } from './charts';
import { StatusDot } from './ui';

export function MonitorList({ monitors, showProject }: { monitors: Monitor[]; showProject?: boolean }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {monitors.map((m) => (
        <li key={m.id}>
          <Link to={`/monitors/${m.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-800/30">
            <StatusDot status={m.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={clsx('truncate font-medium', !m.enabled && 'text-zinc-400')}>{m.name}</span>
                <span className="hidden rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase sm:inline dark:bg-zinc-800 dark:text-zinc-400">{m.type}</span>
                {m.cert_days_remaining !== null && m.cert_days_remaining < 14 && (
                  <span title={`Certificate expires in ${m.cert_days_remaining} days`}>
                    <ShieldAlert className="size-3.5 text-amber-500" />
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {showProject && m.project && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: m.project.color }} />
                    {m.project.name}
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  </span>
                )}
                <span className="truncate">{m.status === 'paused' ? 'Paused' : `${m.last_message ?? 'Waiting for first check'} · ${timeAgo(m.last_check_at)}`}</span>
              </div>
            </div>
            <HeartbeatBar beats={m.heartbeats ?? []} slots={30} className="hidden w-48 md:flex xl:w-64" />
            <div className="hidden w-20 text-right sm:block">
              <div className="text-sm font-medium tabular-nums">{pct(m.uptime24h)}</div>
              <div className="text-xs text-zinc-500 tabular-nums">{ms(m.last_latency_ms)}</div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
