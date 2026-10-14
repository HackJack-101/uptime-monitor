import { t, type MessageKey } from '../i18n';
import { seconds } from '../lib/format';
import type { CheckSettingsOverrides, EffectiveSettings } from '../lib/types';
import { Field, Input } from './ui';

const FIELDS: { key: keyof CheckSettingsOverrides; inherit: keyof EffectiveSettings; label: MessageKey; unit: string; help: MessageKey; min: number; max: number }[] = [
  { key: 'interval_s', inherit: 'intervalS', label: 'checkSettings.interval', unit: 's', help: 'checkSettings.intervalHelp', min: 20, max: 86400 },
  { key: 'timeout_s', inherit: 'timeoutS', label: 'checkSettings.timeout', unit: 's', help: 'checkSettings.timeoutHelp', min: 1, max: 120 },
  { key: 'retries', inherit: 'retries', label: 'checkSettings.retries', unit: '', help: 'checkSettings.retriesHelp', min: 0, max: 10 },
  { key: 'retry_interval_s', inherit: 'retryIntervalS', label: 'checkSettings.retryInterval', unit: 's', help: 'checkSettings.retryIntervalHelp', min: 10, max: 3600 },
  { key: 'degraded_threshold_ms', inherit: 'degradedThresholdMs', label: 'checkSettings.degraded', unit: 'ms', help: 'checkSettings.degradedHelp', min: 1, max: 120000 },
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
          parent === null ? t('common.disabled') : f.unit === 's' ? `${seconds(parent as number)} (${inheritedFrom})` : `${parent}${f.unit ? ` ${f.unit}` : ''} (${inheritedFrom})`;
        return (
          <Field key={f.key} label={`${t(f.label)}${f.unit ? ` (${f.unit})` : ''}`} help={t(f.help)} htmlFor={`cs-${f.key}`}>
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
