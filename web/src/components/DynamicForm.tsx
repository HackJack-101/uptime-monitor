import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import type { FieldDef, TypeDef } from '../lib/types';
import { Button, Field, Input, PasswordInput, Select, Switch, Textarea } from './ui';

export type SecretInput = Record<string, string | null | undefined>;

export function initialConfig(def: TypeDef, current: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.kind === 'secret' || f.kind === 'secret-textarea') continue;
    out[f.key] = current[f.key] ?? f.default ?? (f.kind === 'boolean' ? false : f.kind === 'headers' ? {} : '');
  }
  return out;
}

function visible(f: FieldDef, config: Record<string, unknown>) {
  return !f.showIf || f.showIf.in.includes(config[f.showIf.field] as string | boolean);
}

function HeadersEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(value ?? {}));
  const update = (next: [string, string][]) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter(([k]) => k.trim())));
  };
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder={t('form.headerName')} value={k} onChange={(e) => update(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="w-2/5" />
          <Input placeholder={t('form.headerValue')} value={v} onChange={(e) => update(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <Button variant="ghost" size="icon" onClick={() => update(rows.filter((_, j) => j !== i))} aria-label={t('form.removeHeader')}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => update([...rows, ['', '']])}>
        {t('form.addHeader')}
      </Button>
    </div>
  );
}

function SecretField({ f, stored, value, onChange }: { f: FieldDef; stored: boolean; value: string | null | undefined; onChange: (v: string | null | undefined) => void }) {
  const editing = value !== undefined && value !== null;
  if (stored && !editing) {
    const removed = value === null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 dark:border-zinc-700">
        <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <KeyRound className="size-4 text-emerald-500" />
          {removed ? <span className="text-rose-600">{t('form.willBeRemoved')}</span> : t('common.storedSecret')}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            {t('common.replace')}
          </Button>
          {!f.required && (
            <Button size="sm" variant="ghost" onClick={() => onChange(removed ? undefined : null)}>
              {removed ? t('common.undo') : t('common.remove')}
            </Button>
          )}
        </div>
      </div>
    );
  }
  return f.kind === 'secret-textarea' ? (
    <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} autoComplete="off" spellCheck={false} rows={6} />
  ) : (
    <PasswordInput value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} autoComplete="new-password" />
  );
}

export function DynamicForm({
  def,
  config,
  onConfig,
  storedSecrets = {},
  secrets,
  onSecrets,
}: {
  def: TypeDef;
  config: Record<string, unknown>;
  onConfig: (c: Record<string, unknown>) => void;
  storedSecrets?: Record<string, boolean>;
  secrets: SecretInput;
  onSecrets: (s: SecretInput) => void;
}) {
  const set = (key: string, value: unknown) => onConfig({ ...config, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {def.fields.filter((f) => visible(f, config)).map((f) => {
        const id = `field-${f.key}`;
        const wide = ['url', 'textarea', 'headers', 'secret-textarea'].includes(f.kind) || f.key === 'keyword';
        const isSecret = f.kind === 'secret' || f.kind === 'secret-textarea';
        if (f.kind === 'boolean') {
          return (
            <div key={f.key} className="sm:col-span-2">
              <Switch checked={Boolean(config[f.key])} onChange={(v) => set(f.key, v)} label={f.label} description={f.help} />
            </div>
          );
        }
        return (
          <div key={f.key} className={wide ? 'sm:col-span-2' : undefined}>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  {f.label}
                  {isSecret && <KeyRound className="size-3.5 text-zinc-400" aria-label={t('form.secret')} />}
                </span>
              }
              help={f.help}
              required={f.required && !(isSecret && storedSecrets[f.key])}
              htmlFor={id}
            >
              {isSecret ? (
                <SecretField
                  f={f}
                  stored={Boolean(storedSecrets[f.key])}
                  value={secrets[f.key]}
                  onChange={(v) => onSecrets({ ...secrets, [f.key]: v })}
                />
              ) : f.kind === 'select' ? (
                <Select id={id} value={String(config[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.kind === 'textarea' ? (
                <Textarea id={id} value={String(config[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : f.kind === 'headers' ? (
                <HeadersEditor value={(config[f.key] as Record<string, string>) ?? {}} onChange={(v) => set(f.key, v)} />
              ) : (
                <Input
                  id={id}
                  type={f.kind === 'number' ? 'number' : f.kind === 'url' ? 'url' : 'text'}
                  inputMode={f.kind === 'number' ? 'numeric' : undefined}
                  min={f.min}
                  max={f.max}
                  value={String(config[f.key] ?? '')}
                  onChange={(e) => set(f.key, f.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  placeholder={f.placeholder}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        );
      })}
    </div>
  );
}

/** Send only secrets the user touched; empty strings mean "not provided". */
export function secretsPayload(secrets: SecretInput): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (v === null) out[k] = null;
    else if (typeof v === 'string' && v !== '') out[k] = v;
  }
  return out;
}
