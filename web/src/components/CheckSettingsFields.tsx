import { seconds } from '../lib/format';
import type { CheckSettingsOverrides, EffectiveSettings } from '../lib/types';
import { Field, Input } from './ui';

const FIELDS: { key: keyof CheckSettingsOverrides; inherit: keyof EffectiveSettings; label: string; unit: string; help: string; min: number; max: number }[] = [
  { key: 'interval_s', inherit: 'intervalS', label: 'Check interval', unit: 's', help: 'Time between two checks.', min: 20, max: 86400 },
  { key: 'timeout_s', inherit: 'timeoutS', label: 'Timeout', unit: 's', help: 'A check slower than this fails.', min: 1, max: 120 },
  { key: 'retries', inherit: 'retries', label: 'Retries', unit: '', help: 'Failed checks tolerated before marking DOWN.', min: 0, max: 10 },
  { key: 'retry_interval_s', inherit: 'retryIntervalS', label: 'Retry interval', unit: 's', help: 'Delay between retries while failing.', min: 10, max: 3600 },
  { key: 'degraded_threshold_ms', inherit: 'degradedThresholdMs', label: 'Degraded above', unit: 'ms', help: 'Response time that marks the service as DEGRADED.', min: 1, max: 120000 },
];

/** Editable check rules. Empty field = inherit from the parent scope (shown as placeholder). */
export function CheckSettingsFields({
  value,
  onChange,
  inherited,
  inheritedFrom,
}: {
  value: CheckSettingsOverrides;
  onChange: (v: CheckSettingsOverrides) => void;
  inherited: EffectiveSettings;
  inheritedFrom: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((f) => {
        const parent = inherited[f.inherit];
        const placeholder =
          parent === null ? 'Disabled' : f.unit === 's' ? `${seconds(parent as number)} (${inheritedFrom})` : `${parent}${f.unit ? ` ${f.unit}` : ''} (${inheritedFrom})`;
        return (
          <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`} help={f.help} htmlFor={`cs-${f.key}`}>
            <Input
              id={`cs-${f.key}`}
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              placeholder={placeholder}
              value={value[f.key] ?? ''}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
        );
      })}
    </div>
  );
}

export function pickOverrides(o: Partial<CheckSettingsOverrides>): CheckSettingsOverrides {
  return {
    interval_s: o.interval_s ?? null,
    timeout_s: o.timeout_s ?? null,
    retries: o.retries ?? null,
    retry_interval_s: o.retry_interval_s ?? null,
    degraded_threshold_ms: o.degraded_threshold_ms ?? null,
  };
}
