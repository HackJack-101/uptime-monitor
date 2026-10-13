export interface CheckContext {
  // Validated against the monitor type definition before reaching a checker.
  config: Record<string, any>;
  secrets: Record<string, string>;
  timeoutMs: number;
}

export interface CheckOutcome {
  ok: boolean;
  latencyMs: number | null;
  message: string;
  certDaysRemaining?: number;
}

export type Checker = (ctx: CheckContext) => Promise<CheckOutcome>;

export function elapsed(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1e6);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code && !err.message.includes(code) ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

export function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / 86_400_000);
}

/** Hostnames / IPs only: prevents argument injection into external binaries. */
export function isSafeHost(host: string): boolean {
  return /^[A-Za-z0-9_:][A-Za-z0-9._:-]*$/.test(host) && host.length <= 253;
}

/** Parse "200-299,301" into a predicate. */
export function statusMatcher(spec: string): (code: number) => boolean {
  const parts = spec
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [a, b] = p.split('-').map((x) => Number.parseInt(x.trim(), 10));
      return [a, b ?? a] as [number | undefined, number | undefined];
    });
  return (code) => parts.some(([lo, hi]) => lo !== undefined && hi !== undefined && code >= lo && code <= hi);
}
