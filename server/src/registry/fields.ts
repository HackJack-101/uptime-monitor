import { z } from 'zod';

export type FieldKind = 'text' | 'url' | 'number' | 'select' | 'textarea' | 'boolean' | 'headers' | 'secret' | 'secret-textarea';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Only show / validate this field when another field has one of the given values. */
  showIf?: { field: string; in: (string | boolean)[] };
}

export interface TypeDef {
  type: string;
  label: string;
  description: string;
  fields: FieldDef[];
}

export const isSecretField = (f: FieldDef): boolean => f.kind === 'secret' || f.kind === 'secret-textarea';

function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.kind) {
    case 'number': {
      let s = z.coerce.number().int();
      if (f.min !== undefined) s = s.min(f.min);
      if (f.max !== undefined) s = s.max(f.max);
      return s;
    }
    case 'boolean':
      return z.boolean();
    case 'select':
      return z.enum(f.options!.map((o) => o.value) as [string, ...string[]]);
    case 'headers':
      return z.record(z.string().trim().min(1).max(256).regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'Invalid header name'), z.string().max(4096));
    case 'url':
      return z.string().trim().max(2048).url().refine((v) => /^https?:\/\//i.test(v), 'URL must start with http:// or https://');
    case 'textarea':
      return z.string().max(65536);
    default:
      return z.string().trim().max(2048);
  }
}

function isVisible(f: FieldDef, values: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  return f.showIf.in.includes(values[f.showIf.field] as string | boolean);
}

export interface ParsedPayload {
  config: Record<string, unknown>;
  /** Secret updates: string = set, null = clear, undefined = keep the existing value. */
  secrets: Record<string, string | null | undefined>;
}

/**
 * Validate a raw config/secrets payload against a type definition.
 * `existingSecrets` contains the names of secrets already stored (for required checks on update).
 */
export function parsePayload(
  def: TypeDef,
  rawConfig: unknown,
  rawSecrets: unknown,
  existingSecrets: Set<string> = new Set(),
): { ok: true; value: ParsedPayload } | { ok: false; errors: string[] } {
  const configIn = (rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) as Record<string, unknown>;
  const secretsIn = (rawSecrets && typeof rawSecrets === 'object' ? rawSecrets : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const config: Record<string, unknown> = {};

  // Resolve non-secret fields first (showIf may depend on them).
  for (const f of def.fields.filter((x) => !isSecretField(x))) {
    let value = configIn[f.key];
    if (value === undefined || value === null || value === '') {
      if (f.default !== undefined) value = f.default;
      else if (f.kind === 'headers') value = {};
      else if (f.kind === 'boolean') value = false;
    }
    config[f.key] = value;
  }
  for (const f of def.fields.filter((x) => !isSecretField(x))) {
    const value = config[f.key];
    if (!isVisible(f, config)) {
      delete config[f.key];
      continue;
    }
    if (value === undefined || value === null || value === '') {
      if (f.required) errors.push(`${f.label} is required`);
      delete config[f.key];
      continue;
    }
    const parsed = fieldSchema(f).safeParse(value);
    if (!parsed.success) errors.push(`${f.label}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);
    else config[f.key] = parsed.data;
  }

  const secrets: Record<string, string | null | undefined> = {};
  for (const f of def.fields.filter(isSecretField)) {
    const value = secretsIn[f.key];
    const visible = isVisible(f, config);
    if (!visible) {
      secrets[f.key] = null; // drop secrets that no longer apply
      continue;
    }
    if (value === undefined) {
      if (f.required && !existingSecrets.has(f.key)) errors.push(`${f.label} is required`);
      secrets[f.key] = undefined;
    } else if (value === null || value === '') {
      if (f.required) errors.push(`${f.label} is required`);
      secrets[f.key] = null;
    } else if (typeof value !== 'string' || value.length > 65536) {
      errors.push(`${f.label}: invalid value`);
    } else {
      secrets[f.key] = value;
    }
  }

  // Reject unknown secret keys explicitly.
  for (const key of Object.keys(secretsIn)) {
    if (!def.fields.some((f) => f.key === key && isSecretField(f))) errors.push(`Unknown secret field: ${key}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { config, secrets } };
}

/** Merge secret updates into the existing decrypted secret map. */
export function mergeSecrets(
  existing: Record<string, string>,
  updates: Record<string, string | null | undefined>,
): Record<string, string> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value === null) delete result[key];
    else result[key] = value;
  }
  return result;
}

/** Describe which secrets are set without revealing their value. */
export function secretPresence(def: TypeDef, secrets: Record<string, string>): Record<string, boolean> {
  return Object.fromEntries(def.fields.filter(isSecretField).map((f) => [f.key, Boolean(secrets[f.key])]));
}
