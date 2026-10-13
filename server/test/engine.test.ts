import { describe, expect, it } from 'vitest';
import { decideEvents, type CheckTransition } from '../src/notifications/engine.js';
import { resolveCheckSettings } from '../src/settings.js';
import type { MonitorStatus, RuleEvent } from '../src/types.js';

const rule = (events: RuleEvent[], failure_threshold = 1, reminder_interval_min = 0) => ({ events, failure_threshold, reminder_interval_min });
const t = (previous: MonitorStatus, current: MonitorStatus, downChecks = 0, extra: Partial<CheckTransition> = {}) =>
  ({ previous, current, downChecks, message: '', ...extra }) as CheckTransition;

describe('decideEvents', () => {
  it('sends DOWN once the threshold is reached, not before', () => {
    const r = rule(['down', 'up'], 3);
    expect(decideEvents(r, undefined, t('up', 'down', 1)).send).toEqual([]);
    expect(decideEvents(r, undefined, t('down', 'down', 3)).send).toEqual(['down']);
  });

  it('does not repeat DOWN without a reminder interval', () => {
    const state = { last_event: 'down', last_sent_at: new Date().toISOString(), cert_sent_at: null };
    expect(decideEvents(rule(['down']), state, t('down', 'down', 5)).send).toEqual([]);
  });

  it('sends reminders after the interval', () => {
    const state = { last_event: 'down', last_sent_at: new Date(Date.now() - 31 * 60_000).toISOString(), cert_sent_at: null };
    expect(decideEvents(rule(['down'], 1, 30), state, t('down', 'down', 9)).send).toEqual(['down']);
  });

  it('sends UP only after a DOWN was notified', () => {
    expect(decideEvents(rule(['down', 'up']), undefined, t('down', 'up')).send).toEqual([]);
    const state = { last_event: 'down', last_sent_at: null, cert_sent_at: null };
    const d = decideEvents(rule(['down', 'up']), state, t('down', 'up'));
    expect(d.send).toEqual(['up']);
    expect(d.lastEvent).toBe('up');
  });

  it('tracks degraded transitions', () => {
    const d = decideEvents(rule(['degraded', 'up']), undefined, t('up', 'degraded'));
    expect(d.send).toEqual(['degraded']);
    const back = decideEvents(rule(['degraded', 'up']), { last_event: 'degraded', last_sent_at: null, cert_sent_at: null }, t('degraded', 'up'));
    expect(back.send).toEqual(['up']);
  });

  it('sends certificate warnings at most once a day', () => {
    const tr = t('up', 'up', 0, { certDaysRemaining: 5, certThresholdDays: 14 });
    expect(decideEvents(rule(['cert_expiring']), undefined, tr).send).toEqual(['cert_expiring']);
    const recent = { last_event: null, last_sent_at: null, cert_sent_at: new Date().toISOString() };
    expect(decideEvents(rule(['cert_expiring']), recent, tr).send).toEqual([]);
  });
});

describe('resolveCheckSettings', () => {
  it('prefers monitor overrides, then project defaults, then global defaults', () => {
    const s = resolveCheckSettings({ interval_s: 120, retries: 2 }, { interval_s: 30 });
    expect(s).toEqual({ intervalS: 30, timeoutS: 10, retries: 2, retryIntervalS: 30, degradedThresholdMs: null });
  });
});
