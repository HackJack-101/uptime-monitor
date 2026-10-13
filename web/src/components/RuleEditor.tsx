import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useMeta } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import { EVENT_LABEL } from '../lib/format';
import type { Channel, Rule, RuleEvent } from '../lib/types';
import { Button, Field, Input, Modal, Switch, useToast } from './ui';

export function RuleEditor({
  projectId,
  monitorId,
  rule,
  channels,
  onClose,
}: {
  projectId: number;
  monitorId: number | null;
  rule?: Rule;
  channels: Channel[];
  onClose: () => void;
}) {
  const meta = useMeta();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? (monitorId ? 'Monitor alert' : 'Project alert'));
  const [events, setEvents] = useState<RuleEvent[]>(rule?.events ?? ['down', 'up']);
  const [threshold, setThreshold] = useState(rule?.failure_threshold ?? 1);
  const [reminder, setReminder] = useState(rule?.reminder_interval_min ?? 0);
  const [channelIds, setChannelIds] = useState<number[]>(rule?.channel_ids ?? []);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, events, failure_threshold: threshold, reminder_interval_min: reminder, channel_ids: channelIds, enabled };
      return rule ? api.patch(`/api/rules/${rule.id}`, body) : api.post(`/api/projects/${projectId}/rules`, { ...body, monitor_id: monitorId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', projectId] });
      toast(rule ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={rule ? 'Edit notification rule' : 'New notification rule'}
      description={monitorId ? 'This rule only applies to this monitor.' : 'This rule applies to every monitor of the project that inherits project rules.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!events.length || !channelIds.length}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name" required htmlFor="rule-name">
          <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Notify when the service…</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(meta.data?.ruleEvents ?? []).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEvents(toggle(events, e))}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ring-1 transition-colors ring-inset',
                  events.includes(e) ? 'bg-brand-50 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40' : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800/50',
                )}
              >
                <span className={clsx('flex size-4 items-center justify-center rounded border', events.includes(e) ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-300 dark:border-zinc-600')}>
                  {events.includes(e) && <Check className="size-3" strokeWidth={3} />}
                </span>
                {EVENT_LABEL[e]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Failure threshold" help="Consecutive DOWN checks before alerting." htmlFor="rule-threshold">
            <Input id="rule-threshold" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Reminder every (minutes)" help="Re-send while still down. 0 = never." htmlFor="rule-reminder">
            <Input id="rule-reminder" type="number" min={0} max={10080} value={reminder} onChange={(e) => setReminder(Number(e.target.value) || 0)} />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Send to</legend>
          {channels.length === 0 ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500 dark:bg-zinc-800/50">Create a notification channel in the project first.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannelIds(toggle(channelIds, c.id))}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ring-1 transition-colors ring-inset',
                    channelIds.includes(c.id) ? 'bg-brand-50 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40' : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800/50',
                  )}
                >
                  <span className={clsx('flex size-4 items-center justify-center rounded border', channelIds.includes(c.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-300 dark:border-zinc-600')}>
                    {channelIds.includes(c.id) && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-zinc-400 capitalize">{c.type}</span>
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>
    </Modal>
  );
}
