import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMeta } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import { EVENT_LABEL } from '../lib/format';
import { t } from '../i18n';
import type { Channel, Rule } from '../lib/types';
import { ChannelEditor } from './ChannelEditor';
import { RuleEditor } from './RuleEditor';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Spinner, useToast } from './ui';

export function useChannels(projectId: number) {
  return useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => api.get<{ channels: Channel[] }>(`/api/projects/${projectId}/channels`).then((r) => r.channels),
  });
}

export function RulesPanel({ projectId, monitorId, canEdit, inheritProject = true }: { projectId: number; monitorId?: number; canEdit: boolean; inheritProject?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const channels = useChannels(projectId);
  const rules = useQuery({
    queryKey: ['rules', projectId, monitorId ?? 'project'],
    queryFn: () => api.get<{ rules: Rule[] }>(`/api/projects/${projectId}/rules${monitorId ? `?monitorId=${monitorId}` : ''}`).then((r) => r.rules),
  });
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', projectId] });
      setDeleting(null);
      toast(t('rules.deleted'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const list = monitorId ? (rules.data ?? []).filter((r) => r.monitor_id === monitorId || (inheritProject && r.monitor_id === null)) : (rules.data ?? []).filter((r) => r.monitor_id === null);
  const channelName = (id: number) => channels.data?.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <Card>
      <CardHeader
        title={t('rules.title')}
        description={monitorId ? t('rules.descMonitor') : t('rules.descProject')}
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              {t('rules.add')}
            </Button>
          )
        }
      />
      {rules.isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Bell className="size-5" />} title={t('rules.empty')} description={t('rules.emptyHelp')} />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {list.map((r) => {
            const inherited = monitorId && r.monitor_id === null;
            return (
              <li key={r.id} className="flex items-start gap-3 px-5 py-4 sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {inherited ? <Badge tone="brand">{t('rules.badgeProject')}</Badge> : monitorId ? <Badge>{t('rules.badgeMonitor')}</Badge> : null}
                    {!r.enabled && <Badge tone="amber">{t('common.disabled')}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {r.events.map((e) => EVENT_LABEL[e]).join(', ')} → {r.channel_ids.map(channelName).join(', ')}
                    {r.failure_threshold > 1 && ` · ${t('rules.afterFailures', r.failure_threshold)}`}
                    {r.reminder_interval_min > 0 && ` · ${t('rules.reminderEvery', r.reminder_interval_min)}`}
                  </p>
                </div>
                {canEdit && !inherited && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label={t('rules.editAria')}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} aria-label={t('rules.deleteAria')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <RuleEditor
          projectId={projectId}
          monitorId={monitorId ?? null}
          rule={editing === 'new' ? undefined : editing}
          channels={channels.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={t('rules.deleteTitle')}
        message={t('rules.deleteMessage', deleting?.name ?? '')}
      />
    </Card>
  );
}

export function ChannelsPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const meta = useMeta();
  const channels = useChannels(projectId);
  const [editing, setEditing] = useState<Channel | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);

  const test = useMutation({
    mutationFn: (id: number) => api.post<{ ok: boolean; error?: string }>(`/api/channels/${id}/test`),
    onSuccess: (r) => (r.ok ? toast(t('channels.testSent')) : toast(t('channels.deliveryFailed', r.error ?? ''), 'error')),
    onError: (e) => toast(errorText(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/channels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', projectId] });
      qc.invalidateQueries({ queryKey: ['rules', projectId] });
      setDeleting(null);
      toast(t('channels.deleted'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const label = (type: string) => meta.data?.channelTypes.find((t) => t.type === type)?.label ?? type;

  return (
    <Card>
      <CardHeader
        title={t('channels.title')}
        description={t('channels.description')}
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              {t('channels.add')}
            </Button>
          )
        }
      />
      {channels.isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : !channels.data?.length ? (
        <EmptyState icon={<Send className="size-5" />} title={t('channels.empty')} description={t('channels.emptyHelp')} />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {channels.data.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-5 py-4 sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge>{label(c.type)}</Badge>
                  {!c.enabled && <Badge tone="amber">{t('common.disabled')}</Badge>}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} loading={test.isPending && test.variables === c.id} onClick={() => test.mutate(c.id)}>
                    {t('common.test')}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label={t('channels.editAria')}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(c)} aria-label={t('channels.deleteAria')}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <ChannelEditor projectId={projectId} channel={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={t('channels.deleteTitle')}
        message={t('channels.deleteMessage', deleting?.name ?? '')}
      />
    </Card>
  );
}
