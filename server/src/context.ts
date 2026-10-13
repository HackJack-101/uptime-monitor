import type { SecretBox } from './crypto.js';
import type { Database } from './db.js';
import type { NotificationEngine } from './notifications/engine.js';
import type { Scheduler } from './scheduler.js';

export interface AppContext {
  db: Database;
  box: SecretBox;
  notifier: NotificationEngine;
  scheduler: Scheduler;
  /** One-time token required to create the superadmin from the web UI (null once set up). */
  setupToken: string | null;
}
