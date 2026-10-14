export type Role = 'superadmin' | 'admin' | 'user';
export type MemberRole = 'viewer' | 'editor';
export type MonitorStatus = 'up' | 'down' | 'degraded' | 'pending' | 'paused';

/** Interface languages offered in the web UI. */
export const LOCALES = ['en-US', 'fr-FR'] as const;
export type Locale = (typeof LOCALES)[number];

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  /** Interface language (see LOCALES), NULL to follow the browser. */
  locale: string | null;
  active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  name: string;
  description: string;
  color: string;
  interval_s: number | null;
  timeout_s: number | null;
  retries: number | null;
  retry_interval_s: number | null;
  degraded_threshold_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorRow {
  id: number;
  project_id: number;
  name: string;
  type: string;
  enabled: number;
  config: string;
  secrets: string | null;
  interval_s: number | null;
  timeout_s: number | null;
  retries: number | null;
  retry_interval_s: number | null;
  degraded_threshold_ms: number | null;
  inherit_notifications: number;
  status: MonitorStatus;
  consecutive_failures: number;
  last_check_at: string | null;
  last_latency_ms: number | null;
  last_message: string | null;
  cert_days_remaining: number | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelRow {
  id: number;
  project_id: number;
  name: string;
  type: string;
  enabled: number;
  config: string;
  secrets: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleRow {
  id: number;
  project_id: number;
  monitor_id: number | null;
  name: string;
  enabled: number;
  events: string;
  failure_threshold: number;
  reminder_interval_min: number;
  created_at: string;
  updated_at: string;
}

export const RULE_EVENTS = ['down', 'up', 'degraded', 'cert_expiring'] as const;
export type RuleEvent = (typeof RULE_EVENTS)[number];
