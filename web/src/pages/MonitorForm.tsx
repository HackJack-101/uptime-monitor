import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Globe, KeyRound, Lock, Network, Radar, Server, Terminal } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckSettingsFields, pickOverrides } from '../components/CheckSettingsFields';
import { DynamicForm, initialConfig, secretsPayload, type SecretInput } from '../components/DynamicForm';
import { Button, Card, CardHeader, Field, Input, PageHeader, PageLoader, Switch, useToast } from '../components/ui';
import { useMeta } from '../hooks/useAuth';
import { t, tServer } from '../i18n';
import { api, errorText } from '../lib/api';
import { monitorQuery, projectQuery } from '../lib/queries';
import type { CheckSettingsOverrides, Monitor, Project } from '../lib/types';
import { BackLink } from './ProjectDetail';

const TYPE_ICON: Record<string, typeof Globe> = { http: Globe, tcp: Network, ping: Radar, ssh: Terminal, dns: Server, tls: Lock };

export function MonitorFormPage() {
  const params = useParams();
  const monitorId = params.monitorId ? Number(params.monitorId) : undefined;
  const existing = useQuery({ ...monitorQuery(monitorId ?? 0), enabled: Boolean(monitorId) });
  const monitor = existing.data?.monitor;
  const projectId = monitorId ? monitor?.project_id : Number(params.id);
  const project = useQuery({ ...projectQuery(projectId ?? 0), enabled: Boolean(projectId) });
  const meta = useMeta();

  if (!meta.data || !project.data || (monitorId && !monitor)) return <PageLoader />;
  return <MonitorFormInner key={monitorId ?? 'new'} monitor={monitor} project={project.data} />;
}

function MonitorFormInner({ monitor, project }: { monitor?: Monitor; project: Project }) {
  const meta = useMeta().data!;
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // Prefill from the query string, e.g. the "Monitor it" action of the DNS view.
  const prefill = monitor ? {} : Object.fromEntries(search.entries());
  const [type, setType] = useState(monitor?.type ?? (meta.monitorTypes.some((t) => t.type === prefill.type) ? prefill.type! : 'http'));
  const def = meta.monitorTypes.find((t) => t.type === type)!;
  const [name, setName] = useState(monitor?.name ?? prefill.name ?? '');
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true);
  const [inherit, setInherit] = useState(monitor?.inherit_notifications ?? true);
  const [config, setConfig] = useState(() => initialConfig(def, monitor?.config ?? (prefill.url ? { url: prefill.url } : {})));
  const [secrets, setSecrets] = useState<SecretInput>({});
  const [settings, setSettings] = useState<CheckSettingsOverrides>(pickOverrides(monitor ?? {}));
  const [errors, setErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, type, enabled, inherit_notifications: inherit, config, secrets: secretsPayload(secrets), ...settings };
      return monitor
        ? api.patch<{ monitor: Monitor }>(`/api/monitors/${monitor.id}`, body)
        : api.post<{ monitor: Monitor }>('/api/monitors', { ...body, project_id: project.id });
    },
    onSuccess: ({ monitor: m }) => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      qc.invalidateQueries({ queryKey: ['monitor', m.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(monitor ? t('monitorForm.saved') : t('monitorForm.created'));
      navigate(`/monitors/${m.id}`);
    },
    onError: (e) => {
      const details = (e as { details?: string[] }).details;
      setErrors(details ? details.map((d) => tServer(d)) : [errorText(e)]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const inheritedSettings = project.effective ?? meta.defaults;
  const sameType = monitor?.type === type;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors([]);
        save.mutate();
      }}
      className="mx-auto max-w-4xl"
    >
      <PageHeader
        back={<BackLink to={monitor ? `/monitors/${monitor.id}` : `/projects/${project.id}`}>{monitor ? monitor.name : project.name}</BackLink>}
        title={monitor ? t('monitorForm.editTitle') : t('monitorForm.newTitle')}
        description={
          <span className="inline-flex items-center gap-1.5">
            {t('monitorForm.in')} <span className="size-2 rounded-sm" style={{ background: project.color }} /> {project.name}
          </span>
        }
      />

      {errors.length > 0 && (
        <div className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader title={t('monitorForm.checkType')} />
          <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3">
            {meta.monitorTypes.map((t) => {
              const Icon = TYPE_ICON[t.type] ?? Globe;
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    setType(t.type);
                    setConfig(initialConfig(t, t.type === monitor?.type ? monitor.config : {}));
                    setSecrets({});
                  }}
                  className={clsx(
                    'flex flex-col items-start gap-1.5 rounded-xl p-3 text-left ring-1 transition-all ring-inset',
                    type === t.type ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/10' : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800/40',
                  )}
                >
                  <Icon className={clsx('size-5', type === t.type ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400')} />
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{t.description}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('monitorForm.target')}
            description={
              <span className="inline-flex items-center gap-1">
                <KeyRound className="size-3" /> {t('monitorForm.secretsHint')}
              </span>
            }
          />
          <div className="space-y-4 p-5">
            <Field label={t('monitorForm.displayName')} required htmlFor="m-name">
              <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('monitorForm.namePlaceholder')} required />
            </Field>
            <DynamicForm def={def} config={config} onConfig={setConfig} storedSecrets={sameType ? monitor?.secrets : {}} secrets={secrets} onSecrets={setSecrets} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t('monitorForm.checkRules')} description={t('monitorForm.checkRulesHelp')} />
          <div className="p-5">
            <CheckSettingsFields value={settings} onChange={setSettings} inherited={inheritedSettings} inheritedFrom={t('checkSettings.fromProject')} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t('monitorForm.options')} />
          <div className="space-y-5 p-5">
            <Switch checked={enabled} onChange={setEnabled} label={t('common.active')} description={t('monitorForm.activeHelp')} />
            <Switch
              checked={inherit}
              onChange={setInherit}
              label={t('monitorForm.inherit')}
              description={t('monitorForm.inheritHelp')}
            />
          </div>
        </Card>

        <div className="pb-safe sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/90 px-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 dark:border-zinc-800 dark:bg-zinc-950/90 sm:dark:bg-transparent">
          <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {monitor ? t('monitorForm.save') : t('monitorForm.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
