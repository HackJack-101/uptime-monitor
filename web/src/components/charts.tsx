import clsx from 'clsx';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dateTime, STATUS_COLOR, STATUS_LABEL } from '../lib/format';
import type { Heartbeat, MonitorStatus } from '../lib/types';

/** Row of small bars showing the latest check results. */
export function HeartbeatBar({ beats, slots = 30, className }: { beats: Heartbeat[]; slots?: number; className?: string }) {
  const padded: (Heartbeat | null)[] = [...Array(Math.max(0, slots - beats.length)).fill(null), ...beats.slice(-slots)];
  return (
    <div className={clsx('flex h-7 items-stretch gap-[2px] sm:gap-[3px]', className)}>
      {padded.map((b, i) => (
        <div
          key={i}
          title={b ? `${STATUS_LABEL[b.status]} · ${b.latency_ms ?? '—'} ms · ${dateTime(b.checked_at)}` : 'No data'}
          className={clsx(
            'min-w-px flex-1 rounded-full transition-opacity hover:opacity-70',
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
  checks?: number;
  failures?: number;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Candidate spacings between x-axis labels, from 15 minutes to 2 weeks. */
const TIME_STEPS = [0.25, 0.5, 1, 2, 3, 6, 12].map((h) => h * HOUR).concat([1, 2, 7, 14].map((d) => d * DAY));

/** "Nice" upper bound and tick step (1, 2, 2.5 or 5 × 10^n) for a latency axis. */
function niceScale(max: number, maxTicks: number): { top: number; step: number } {
  const rough = Math.max(max, 1) / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
  return { top: Math.ceil(max / step) * step || step, step };
}

function formatLatency(v: number): string {
  if (v >= 1000) return `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} s`;
  return `${Math.round(v)} ms`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Response-time chart drawn at the real pixel size of its container (no stretched text), with a
 * time-based x axis covering the whole range, readable time labels, gaps where no check ran and
 * red bands on periods with failures.
 */
export function LatencyChart({
  points,
  rangeHours,
  bucketSeconds = 60,
  height = 200,
}: {
  points: Point[];
  rangeHours: number;
  bucketSeconds?: number;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 10, right: 12, bottom: 26, left: 52 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const chart = useMemo(() => {
    const end = Date.now();
    const start = end - rangeHours * HOUR;
    const times = points.map((p) => Date.parse(p.checked_at));
    const x = (t: number) => pad.left + ((t - start) / (end - start)) * innerW;

    const values = points.map((p) => p.latency_ms).filter((v): v is number => v !== null);
    const { top, step } = niceScale(Math.max(10, ...values), height < 160 ? 3 : 4);
    const y = (v: number) => pad.top + innerH - (Math.min(v, top) / top) * innerH;
    const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

    // Break the line when no check ran for a while (paused monitor, app down…).
    const gap = Math.max(bucketSeconds * 1000 * 2.5, 5 * 60_000);
    const segments: { x: number; y: number }[][] = [];
    let prev = -Infinity;
    points.forEach((p, i) => {
      if (p.latency_ms === null) {
        prev = -Infinity;
        return;
      }
      if (times[i]! - prev > gap || !segments.length) segments.push([]);
      segments[segments.length - 1]!.push({ x: x(times[i]!), y: y(p.latency_ms) });
      prev = times[i]!;
    });
    const line = segments.map((seg) => seg.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join('')).join('');
    const base = pad.top + innerH;
    const area = segments
      .map((seg) => `M${seg[0]!.x.toFixed(1)},${base}${seg.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join('')}L${seg[seg.length - 1]!.x.toFixed(1)},${base}Z`)
      .join('');

    // Time labels: the smallest round spacing that leaves room per label (tighter on phones), aligned on local time.
    const minSpacing = innerW < 500 ? 56 : 80;
    const stepMs = TIME_STEPS.find((s) => (s / (end - start)) * innerW >= minSpacing) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
    const first = new Date(start);
    if (stepMs >= DAY) first.setHours(0, 0, 0, 0);
    else first.setMinutes(0, 0, 0);
    const xTicks: number[] = [];
    for (let t = first.getTime(); t <= end; t += stepMs) {
      // Day steps must stay on midnight across DST changes.
      const tt = stepMs >= DAY ? new Date(new Date(t).setHours(0, 0, 0, 0)).getTime() : t;
      if (tt >= start && x(tt) - pad.left > 18 && pad.left + innerW - x(tt) > 18) xTicks.push(tt);
    }
    const withDate = stepMs >= DAY || rangeHours > 24;
    const label = (t: number) => {
      const d = new Date(t);
      if (stepMs >= DAY) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return withDate && d.getHours() === 0 ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : time;
    };

    const bandW = Math.max(2, (bucketSeconds * 1000 * innerW) / (end - start));
    return { x, y, times, yTicks, xTicks, label, line, area, bandW };
  }, [points, rangeHours, bucketSeconds, innerW, innerH, height]);

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {points.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">No data yet for this period</div>
      ) : (
        width > 0 && (
          <svg
            width={width}
            height={height}
            className="block touch-none select-none"
            onPointerMove={(e) => {
              const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
              let best = 0;
              chart.times.forEach((t, i) => {
                if (Math.abs(chart.x(t) - px) < Math.abs(chart.x(chart.times[best]!) - px)) best = i;
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
            {chart.yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={chart.y(t)}
                  y2={chart.y(t)}
                  className={t === 0 ? 'stroke-zinc-300 dark:stroke-zinc-700' : 'stroke-zinc-200/70 dark:stroke-zinc-800'}
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text x={pad.left - 8} y={chart.y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
                  {formatLatency(t)}
                </text>
              </g>
            ))}
            {chart.xTicks.map((t) => (
              <g key={t}>
                <line x1={chart.x(t)} x2={chart.x(t)} y1={pad.top + innerH} y2={pad.top + innerH + 4} className="stroke-zinc-300 dark:stroke-zinc-700" />
                <text x={chart.x(t)} y={height - 6} textAnchor="middle" className="fill-zinc-400 text-[11px] tabular-nums">
                  {chart.label(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              p.status === 'down' ? (
                <rect key={i} x={chart.x(chart.times[i]!)} y={pad.top} width={chart.bandW} height={innerH} className="fill-rose-500/20" />
              ) : null,
            )}
            <path d={chart.area} fill="url(#lat-fill)" />
            <path d={chart.line} fill="none" stroke="var(--color-brand-500)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
            {hovered && hover !== null && (
              <>
                <line
                  x1={chart.x(chart.times[hover]!)}
                  x2={chart.x(chart.times[hover]!)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  className="stroke-zinc-300 dark:stroke-zinc-600"
                />
                {hovered.latency_ms !== null && (
                  <circle
                    cx={chart.x(chart.times[hover]!)}
                    cy={chart.y(hovered.latency_ms)}
                    r={4}
                    fill="var(--color-brand-500)"
                    className="stroke-white dark:stroke-zinc-900"
                    strokeWidth={2}
                  />
                )}
              </>
            )}
          </svg>
        )
      )}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg dark:bg-white dark:text-zinc-900"
          style={{
            left: Math.min(Math.max(chart.x(chart.times[hover]!), pad.left + 70), width - 70),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium">
            {hovered.latency_ms !== null ? formatLatency(hovered.latency_ms) : STATUS_LABEL[hovered.status]}
            {!!hovered.failures && <span className="ml-1.5 text-rose-300 dark:text-rose-600">· {hovered.failures} failed</span>}
          </div>
          <div className="opacity-70">
            {dateTime(hovered.checked_at)}
            {hovered.checks && hovered.checks > 1 ? ` · avg of ${hovered.checks} checks` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
