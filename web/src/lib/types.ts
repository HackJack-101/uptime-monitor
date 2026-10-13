export type Role = 'superadmin' | 'admin' | 'user';
export type MemberRole = 'viewer' | 'editor';
export type MonitorStatus = 'up' | 'down' | 'degraded' | 'pending' | 'paused';
export type Access = 'edit' | 'view';
export type RuleEvent = 'down' | 'up' | 'degraded' | 'cert_expiring';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface ManagedUser extends User {
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  memberships: { projectId: number; role: MemberRole }[];
}

export interface CheckSettingsOverrides {
  interval_s: number | null;
  timeout_s: number | null;
  retries: number | null;
  retry_interval_s: number | null;
  degraded_threshold_ms: number | null;
}

export interface EffectiveSettings {
  intervalS: number;
  timeoutS: number;
  retries: number;
  retryIntervalS: number;
  degradedThresholdMs: number | null;
}

export interface Project extends CheckSettingsOverrides {
  id: number;
  name: string;
  description: string;
  color: string;
  access: Access;
  statusCounts: Partial<Record<MonitorStatus, number>>;
  memberCount?: number;
  effective?: EffectiveSettings;
}

export interface Heartbeat {
  status: MonitorStatus;
  latency_ms: number | null;
  checked_at: string;
  message?: string;
}

export interface Monitor extends CheckSettingsOverrides {
  id: number;
  project_id: number;
  name: string;
  type: string;
  enabled: boolean;
  inherit_notifications: boolean;
  config: Record<string, unknown>;
  secrets: Record<string, boolean>;
  status: MonitorStatus;
  consecutive_failures: number;
  last_check_at: string | null;
  last_latency_ms: number | null;
  last_message: string | null;
  cert_days_remaining: number | null;
  status_changed_at: string | null;
  effective?: EffectiveSettings;
  project?: { id: number; name: string; color: string };
  uptime24h?: number | null;
  heartbeats?: Heartbeat[];
  access?: Access;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'number' | 'select' | 'textarea' | 'boolean' | 'headers' | 'secret' | 'secret-textarea';
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  showIf?: { field: string; in: (string | boolean)[] };
}

export interface TypeDef {
  type: string;
  label: string;
  description: string;
  fields: FieldDef[];
}

export interface Meta {
  version: string;
  monitorTypes: TypeDef[];
  channelTypes: TypeDef[];
  ruleEvents: RuleEvent[];
  defaults: EffectiveSettings;
  smtpConfigured: boolean;
}

export interface Channel {
  id: number;
  project_id: number;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets: Record<string, boolean>;
}

export interface Rule {
  id: number;
  project_id: number;
  monitor_id: number | null;
  name: string;
  enabled: boolean;
  events: RuleEvent[];
  failure_threshold: number;
  reminder_interval_min: number;
  channel_ids: number[];
}

export interface Incident {
  id: number;
  monitor_id: number;
  cause: string | null;
  started_at: string;
  resolved_at: string | null;
  monitor_name?: string;
  project_name?: string;
  project_color?: string;
}

export interface UptimeStat {
  uptime: number;
  avg_latency: number | null;
  checks: number;
}
