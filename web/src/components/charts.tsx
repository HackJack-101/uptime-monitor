import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { dateTime, STATUS_COLOR, STATUS_LABEL } from '../lib/format';
import type { Heartbeat, MonitorStatus } from '../lib/types';

/** Row of small bars showing the latest check results. */
export function HeartbeatBar({ beats, slots = 30, className }: { beats: Heartbeat[]; slots?: number; className?: string }) {
  const padded: (Heartbeat | null)[] = [...Array(Math.max(0, slots - beats.length)).fill(null), ...beats.slice(-slots)];
  return (
    <div className={clsx('flex h-7 items-stretch gap-[3px]', className)}>
      {padded.map((b, i) => (
        <div
          key={i}
          title={b ? `${STATUS_LABEL[b.status]} · ${b.latency_ms ?? '—'} ms · ${dateTime(b.checked_at)}` : 'No data'}
          className={clsx(
            'min-w-[3px] flex-1 rounded-full transition-opacity hover:opacity-70',
            b ? STATUS_COLOR[b.status as MonitorStatus] : 'bg-zinc-200 dark:bg-zinc-800',
          )}
        />
      ))}
    </div>
  );
}

interface Point {
  checked_at: string;
  latency_ms: number | null;
  status: MonitorStatus;
}

/** Lightweight responsive SVG response-time chart with hover tooltip and down markers. */
export function LatencyChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const pad = { top: 12, right: 8, bottom: 22, left: 44 };

  const { path, area, max, xs, ys } = useMemo(() => {
    const values = points.map((p) => p.latency_ms ?? 0);
    const maxV = Math.max(10, ...values) * 1.15;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => pad.top + innerH - (v / maxV) * innerH;
    const xsArr = points.map((_, i) => x(i));
    const ysArr = points.map((p) => (p.latency_ms === null ? null : y(p.latency_ms)));
    let d = '';
    let started = false;
    ysArr.forEach((yy, i) => {
      if (yy === null) {
        started = false;
        return;
      }
      d += `${started ? 'L' : 'M'}${xsArr[i]!.toFixed(1)},${yy.toFixed(1)}`;
      started = true;
    });
    const valid = ysArr.map((yy, i) => (yy === null ? null : `${xsArr[i]!.toFixed(1)},${yy.toFixed(1)}`)).filter(Boolean);
    const a = valid.length
      ? `M${valid[0]!.split(',')[0]},${pad.top + innerH}L${valid.join('L')}L${valid[valid.length - 1]!.split(',')[0]},${pad.top + innerH}Z`
      : '';
    return { path: d, area: a, max: maxV, xs: xsArr, ys: ysArr };
  }, [points, height]);

  if (points.length === 0) {
    return <div className="flex items-center justify-center text-sm text-zinc-400" style={{ height }}>No data yet for this period</div>;
  }

  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const innerH = height - pad.top - pad.bottom;
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full touch-none"
        style={{ height }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          let best = 0;
          xs.forEach((x, i) => {
            if (Math.abs(x - px) < Math.abs(xs[best]! - px)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="lat-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" className="fill-zinc-400 text-[10px]">
                {t} ms
              </text>
            </g>
          );
        })}
        {points.map((p, i) =>
          p.status === 'down' ? (
            <rect key={i} x={xs[i]! - 2} y={pad.top} width={4} height={innerH} className="fill-rose-500/20" />
          ) : null,
        )}
        <path d={area} fill="url(#lat-fill)" />
        <path d={path} fill="none" stroke="var(--color-brand-500)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && (
          <>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.top} y2={pad.top + innerH} className="stroke-zinc-300 dark:stroke-zinc-700" vectorEffect="non-scaling-stroke" />
            {ys[hover] !== null && <circle cx={xs[hover]} cy={ys[hover]!} r={4} fill="var(--color-brand-500)" className="stroke-white dark:stroke-zinc-900" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </>
        )}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg dark:bg-white dark:text-zinc-900"
          style={{ left: `${Math.min(90, Math.max(10, (xs[hover]! / width) * 100))}%` }}
        >
          <div className="font-medium">{hovered.latency_ms !== null ? `${hovered.latency_ms} ms` : STATUS_LABEL[hovered.status]}</div>
          <div className="opacity-70">{dateTime(hovered.checked_at)}</div>
        </div>
      )}
    </div>
  );
}
