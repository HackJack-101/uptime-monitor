export interface CheckSettings {
  intervalS: number;
  timeoutS: number;
  retries: number;
  retryIntervalS: number;
  degradedThresholdMs: number | null;
}

export const DEFAULT_CHECK_SETTINGS: CheckSettings = {
  intervalS: 60,
  timeoutS: 10,
  retries: 0,
  retryIntervalS: 30,
  degradedThresholdMs: null,
};

type Overrides = {
  interval_s?: number | null;
  timeout_s?: number | null;
  retries?: number | null;
  retry_interval_s?: number | null;
  degraded_threshold_ms?: number | null;
};

/** Monitor overrides take precedence over project defaults, which take precedence over global defaults. */
export function resolveCheckSettings(project: Overrides, monitor: Overrides): CheckSettings {
  const pick = <K extends keyof Overrides>(key: K): number | null | undefined => monitor[key] ?? project[key];
  return {
    intervalS: pick('interval_s') ?? DEFAULT_CHECK_SETTINGS.intervalS,
    timeoutS: pick('timeout_s') ?? DEFAULT_CHECK_SETTINGS.timeoutS,
    retries: pick('retries') ?? DEFAULT_CHECK_SETTINGS.retries,
    retryIntervalS: pick('retry_interval_s') ?? DEFAULT_CHECK_SETTINGS.retryIntervalS,
    degradedThresholdMs: pick('degraded_threshold_ms') ?? DEFAULT_CHECK_SETTINGS.degradedThresholdMs,
  };
}
