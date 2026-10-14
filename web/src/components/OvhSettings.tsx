import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { t, tServer } from '../i18n';
import { api, errorText } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { OvhAccount } from '../lib/types';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, PasswordInput, Select, useToast } from './ui';

const TOKEN_URL: Record<string, string> = {
  'ovh-eu': 'https://eu.api.ovh.com/createToken/',
  'ovh-ca': 'https://ca.api.ovh.com/createToken/',
  'ovh-us': 'https://api.us.ovhcloud.com/createToken/',
};
const TOKEN_RIGHTS = '?GET=/domain/zone&GET=/domain/zone/*';

export function useOvhAccount(projectId: number) {
  return useQuery({
    queryKey: ['ovh', projectId],
    queryFn: () => api.get<{ account: OvhAccount | null }>(`/api/projects/${projectId}/ovh`).then((r) => r.account),
  });
}

function StoredSecret({ value, onReplace }: { value: string | undefined; onReplace: () => void }) {
  if (value !== undefined) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 dark:border-zinc-700">
      <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <KeyRound className="size-4 text-emerald-500" /> {t('common.storedSecret')}
      </span>
      <Button size="sm" variant="ghost" onClick={onReplace}>
        {t('common.replace')}
      </Button>
    </div>
  );
}

/** Admin card to connect an OVH account and choose the single DNS zone monitored for the project. */
export function OvhSettings({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const account = useOvhAccount(projectId);
  const endpoints = useQuery({
    queryKey: ['ovh-endpoints'],
    queryFn: () => api.get<{ value: string; label: string }[]>('/api/ovh/endpoints'),
    staleTime: Infinity,
  });
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const current = account.data;
  const [endpoint, setEndpoint] = useState('ovh-eu');
  const [applicationKey, setApplicationKey] = useState('');
  const [applicationSecret, setApplicationSecret] = useState<string | undefined>('');
  const [consumerKey, setConsumerKey] = useState<string | undefined>('');
  const [zone, setZone] = useState('');
  const [zones, setZones] = useState<string[] | null>(null);

  const startEdit = () => {
    setEndpoint(current?.endpoint ?? 'ovh-eu');
    setApplicationKey(current?.applicationKey ?? '');
    // undefined = keep the stored secret
    setApplicationSecret(current ? undefined : '');
    setConsumerKey(current ? undefined : '');
    setZone(current?.zone ?? '');
    setZones(null);
    setEditing(true);
  };

  const creds = () => ({
    endpoint,
    applicationKey,
    ...(applicationSecret ? { applicationSecret } : {}),
    ...(consumerKey ? { consumerKey } : {}),
  });

  const loadZones = useMutation({
    mutationFn: () => api.post<{ zones: string[] }>(`/api/projects/${projectId}/ovh/zones`, creds()),
    onSuccess: (r) => {
      setZones(r.zones);
      if (!r.zones.includes(zone)) setZone(r.zones[0] ?? '');
      if (r.zones.length === 0) toast(t('ovh.noZones'), 'error');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const save = useMutation({
    mutationFn: () => api.put(`/api/projects/${projectId}/ovh`, { ...creds(), zone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ovh', projectId] });
      qc.invalidateQueries({ queryKey: ['dns', projectId] });
      setEditing(false);
      toast(t('ovh.connectedToast'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/projects/${projectId}/ovh`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ovh', projectId] });
      qc.removeQueries({ queryKey: ['dns', projectId] });
      setConfirmRemove(false);
      toast(t('ovh.disconnectedToast'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Globe className="size-4 text-zinc-400" /> {t('ovh.title')}
          </span>
        }
        description={t('ovh.description')}
        actions={
          current && !editing ? (
            <>
              <Link to={`/projects/${projectId}/dns`}>
                <Button size="sm">{t('ovh.openDnsView')}</Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={startEdit}>
                {t('common.edit')}
              </Button>
            </>
          ) : null
        }
      />
      <div className="p-5">
        {!editing && !current && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('ovh.none')}</p>
            <Button variant="primary" onClick={startEdit}>
              {t('ovh.connect')}
            </Button>
          </div>
        )}

        {!editing && current && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              {t('ovh.zone')} <span className="font-mono font-medium">{current.zone}</span>
            </span>
            <span className="text-zinc-500">
              {endpoints.data?.find((e) => e.value === current.endpoint)?.label ?? current.endpoint}
            </span>
            <span className="text-zinc-500">{t('ovh.synced', timeAgo(current.syncedAt))}</span>
            {current.lastError ? <Badge tone="red">{tServer(current.lastError)}</Badge> : <Badge tone="green">{t('ovh.connected')}</Badge>}
            <Button size="sm" variant="ghost" className="ml-auto text-rose-600" onClick={() => setConfirmRemove(true)}>
              {t('ovh.disconnect')}
            </Button>
          </div>
        )}

        {editing && (
          <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
              {t('ovh.helpBefore')}{' '}
              <a
                href={`${TOKEN_URL[endpoint] ?? TOKEN_URL['ovh-eu']}${TOKEN_RIGHTS}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                {t('ovh.helpLink')} <ExternalLink className="size-3" />
              </a>
              {t('ovh.helpAfter')}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('ovh.endpoint')} htmlFor="ovh-endpoint">
                <Select id="ovh-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
                  {endpoints.data?.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('ovh.applicationKey')} required htmlFor="ovh-ak">
                <Input id="ovh-ak" value={applicationKey} onChange={(e) => setApplicationKey(e.target.value)} autoComplete="off" />
              </Field>
              <Field label={t('ovh.applicationSecret')} required htmlFor="ovh-as">
                {applicationSecret === undefined ? (
                  <StoredSecret value={applicationSecret} onReplace={() => setApplicationSecret('')} />
                ) : (
                  <PasswordInput id="ovh-as" value={applicationSecret} onChange={(e) => setApplicationSecret(e.target.value)} autoComplete="new-password" />
                )}
              </Field>
              <Field label={t('ovh.consumerKey')} required htmlFor="ovh-ck">
                {consumerKey === undefined ? (
                  <StoredSecret value={consumerKey} onReplace={() => setConsumerKey('')} />
                ) : (
                  <PasswordInput id="ovh-ck" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} autoComplete="new-password" />
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label={t('ovh.domain')} required help={t('ovh.domainHelp')} htmlFor="ovh-zone">
                  {zones ? (
                    <Select id="ovh-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input id="ovh-zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="example.com" autoComplete="off" />
                  )}
                </Field>
              </div>
              <Button onClick={() => loadZones.mutate()} loading={loadZones.isPending} disabled={!applicationKey} className="sm:mb-[1.375rem]">
                {t('ovh.loadDomains')}
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!applicationKey || !zone}>
                {t('ovh.saveSync')}
              </Button>
            </div>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={t('ovh.disconnectTitle')}
        message={t('ovh.disconnectMessage')}
        confirmLabel={t('ovh.disconnect')}
      />
    </Card>
  );
}
