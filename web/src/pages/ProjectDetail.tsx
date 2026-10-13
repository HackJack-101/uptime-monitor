import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CheckSettingsFields, pickOverrides } from '../components/CheckSettingsFields';
import { MonitorList } from '../components/MonitorList';
import { ChannelsPanel, RulesPanel } from '../components/NotificationPanels';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, PageHeader, PageLoader, Select, Tabs, Textarea, useToast } from '../components/ui';
import { useAuth, useMeta } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import type { CheckSettingsOverrides, ManagedUser, MemberRole, Monitor, Project } from '../lib/types';
import { ColorPicker } from './Projects';

type Tab = 'monitors' | 'notifications' | 'members' | 'settings';

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
      <ArrowLeft className="size-3.5" /> {children}
    </Link>
  );
}

function MembersTab({ project }: { project: Project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: ManagedUser[] }>('/api/users').then((r) => r.users) });
  const [members, setMembers] = useState<Map<number, MemberRole>>(new Map());

  useEffect(() => {
    if (!users.data) return;
    const m = new Map<number, MemberRole>();
    for (const u of users.data) {
      const mem = u.memberships.find((x) => x.projectId === project.id);
      if (mem) m.set(u.id, mem.role);
    }
    setMembers(m);
  }, [users.data, project.id]);

  const save = useMutation({
    mutationFn: () => api.put(`/api/projects/${project.id}/members`, { members: [...members].map(([userId, role]) => ({ userId, role })) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast('Members updated');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (users.isLoading) return <PageLoader />;
  const regular = (users.data ?? []).filter((u) => u.role === 'user');

  return (
    <Card>
      <CardHeader
        title="Members"
        description="Admins always have full access to every project. Assign users as viewer (read-only) or editor (manage monitors & notifications)."
        actions={
          <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save members
          </Button>
        }
      />
      {regular.length === 0 ? (
        <EmptyState icon={<Server className="size-5" />} title="No users" description="Create users from the Users page first." />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {regular.map((u) => {
            const role = members.get(u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <div className="truncate text-xs text-zinc-500">{u.email}</div>
                </div>
                <Select
                  className="h-9 w-40"
                  value={role ?? ''}
                  onChange={(e) => {
                    const next = new Map(members);
                    if (e.target.value) next.set(u.id, e.target.value as MemberRole);
                    else next.delete(u.id);
                    setMembers(next);
                  }}
                >
                  <option value="">No access</option>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </Select>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SettingsTab({ project }: { project: Project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const meta = useMeta();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [color, setColor] = useState(project.color);
  const [settings, setSettings] = useState<CheckSettingsOverrides>(pickOverrides(project));
  const [confirm, setConfirm] = useState(false);

  const save = useMutation({
    mutationFn: () => api.patch(`/api/projects/${project.id}`, { name, description, color, ...settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast('Project saved');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/projects/${project.id}`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast('Project deleted');
      navigate('/projects');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="General" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name" required htmlFor="ps-name">
            <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="ps-desc">
              <Textarea id="ps-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16 font-sans text-sm" />
            </Field>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Default check rules" description="Applied to every monitor of this project unless the monitor overrides them. Leave empty to use the global default." />
        <div className="p-5">{meta.data && <CheckSettingsFields value={settings} onChange={setSettings} inherited={meta.data.defaults} inheritedFrom="global" />}</div>
      </Card>
      <div className="flex justify-end">
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      </div>
      <Card className="border-rose-200 dark:border-rose-500/30">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Delete project</h3>
            <p className="mt-0.5 text-sm text-zinc-500">Permanently deletes all monitors, history, channels and rules of this project.</p>
          </div>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete project
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${project.name}?`}
        message="This cannot be undone. Every monitor and its history will be lost."
      />
    </div>
  );
}

export function ProjectDetailPage() {
  const id = Number(useParams().id);
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('monitors');
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api.get<{ project: Project }>(`/api/projects/${id}`).then((r) => r.project) });
  const monitors = useQuery({
    queryKey: ['monitors', 'project', id],
    queryFn: () => api.get<{ monitors: Monitor[] }>(`/api/monitors?projectId=${id}`).then((r) => r.monitors),
    refetchInterval: 15_000,
  });

  if (project.isLoading) return <PageLoader />;
  if (!project.data) return <EmptyState icon={<Server className="size-5" />} title="Project not found" />;
  const p = project.data;
  const canEdit = p.access === 'edit';

  const tabs: { value: Tab; label: string }[] = [
    { value: 'monitors', label: 'Monitors' },
    { value: 'notifications', label: 'Notifications' },
    ...(isAdmin ? ([{ value: 'members', label: 'Members' }, { value: 'settings', label: 'Settings' }] as const) : []),
  ];

  return (
    <>
      <PageHeader
        back={<BackLink to="/projects">Projects</BackLink>}
        title={
          <span className="flex items-center gap-3">
            <span className="size-3.5 rounded" style={{ background: p.color }} />
            {p.name}
            {!canEdit && <Badge>Read-only</Badge>}
          </span>
        }
        description={p.description}
        actions={
          canEdit && (
            <Link to={`/projects/${id}/monitors/new`}>
              <Button variant="primary" icon={<Plus className="size-4" />}>
                Add monitor
              </Button>
            </Link>
          )
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'monitors' && (
        <Card className="overflow-hidden">
          {monitors.isLoading ? (
            <PageLoader />
          ) : !monitors.data?.length ? (
            <EmptyState
              icon={<Server className="size-5" />}
              title="No monitors in this project"
              description="Add an HTTP endpoint, a TCP port, a host to ping, an SSH server, a DNS record or a TLS certificate."
              action={
                canEdit && (
                  <Link to={`/projects/${id}/monitors/new`}>
                    <Button variant="primary">Add monitor</Button>
                  </Link>
                )
              }
            />
          ) : (
            <MonitorList monitors={monitors.data} />
          )}
        </Card>
      )}
      {tab === 'notifications' && (
        <div className="space-y-6">
          <RulesPanel projectId={id} canEdit={canEdit} />
          <ChannelsPanel projectId={id} canEdit={canEdit} />
        </div>
      )}
      {tab === 'members' && isAdmin && <MembersTab project={p} />}
      {tab === 'settings' && isAdmin && <SettingsTab project={p} />}
    </>
  );
}
