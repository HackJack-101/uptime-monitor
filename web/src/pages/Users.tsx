import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, Modal, PageHeader, PageLoader, PasswordInput, Select, Switch, Tabs, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n';
import { api, errorText } from '../lib/api';
import { dateTime, timeAgo } from '../lib/format';
import type { ManagedUser, MemberRole, Project, Role } from '../lib/types';

function UserEditor({ user, projects, onClose }: { user?: ManagedUser; projects: Project[]; onClose: () => void }) {
  const { isSuperadmin, user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'superadmin'>>(user?.role === 'admin' ? 'admin' : 'user');
  const [active, setActive] = useState(user?.active ?? true);
  const [memberships, setMemberships] = useState<Map<number, MemberRole>>(new Map(user?.memberships.map((m) => [m.projectId, m.role])));
  const isSelf = user?.id === me?.id;
  const isSuper = user?.role === 'superadmin';

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        email,
        ...(password ? { password } : {}),
        ...(!isSelf && !isSuper ? { role, active } : {}),
        memberships: [...memberships].map(([projectId, r]) => ({ projectId, role: r })),
      };
      return user ? api.patch(`/api/users/${user.id}`, body) : api.post('/api/users', { ...body, role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(user ? t('users.updated') : t('users.created'));
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? t('users.editTitle', user.name) : t('users.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>
            {t('users.save')}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.name')} required htmlFor="u-name">
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('common.email')} required htmlFor="u-email">
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={user ? t('users.newPassword') : t('common.password')} required={!user} help={user ? t('users.newPasswordHelp') : t('common.passwordHelp')} htmlFor="u-pass">
            <PasswordInput id="u-pass" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('users.role')} htmlFor="u-role" help={role === 'admin' ? t('users.roleAdminHelp') : t('users.roleUserHelp')}>
            <Select id="u-role" value={isSuper ? 'superadmin' : role} disabled={isSelf || isSuper || !isSuperadmin} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              {isSuper && <option value="superadmin">{t('role.superadmin')}</option>}
              <option value="user">{t('role.user')}</option>
              <option value="admin">{t('role.admin')}</option>
            </Select>
          </Field>
        </div>
        {user && !isSelf && !isSuper && <Switch checked={active} onChange={setActive} label={t('common.active')} description={t('users.activeHelp')} />}
        {role === 'user' && !isSuper && (
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('users.projectAccess')}</h4>
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('users.noProjectExists')}</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200 dark:divide-zinc-800 dark:ring-zinc-800">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <Select
                      className="h-9 w-36 sm:h-8 sm:text-xs"
                      value={memberships.get(p.id) ?? ''}
                      onChange={(e) => {
                        const next = new Map(memberships);
                        if (e.target.value) next.set(p.id, e.target.value as MemberRole);
                        else next.delete(p.id);
                        setMemberships(next);
                      }}
                    >
                      <option value="">{t('common.noAccess')}</option>
                      <option value="viewer">{t('memberRole.viewer')}</option>
                      <option value="editor">{t('memberRole.editor')}</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function AuditLog() {
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<{ entries: { id: number; action: string; target: string | null; user_email: string | null; ip: string | null; created_at: string }[] }>('/api/audit').then((r) => r.entries),
  });
  if (audit.isLoading) return <PageLoader />;
  return (
    <Card>
      <CardHeader title={t('audit.title')} description={t('audit.description')} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="px-5 py-2 font-medium">{t('audit.when')}</th>
              <th className="px-5 py-2 font-medium">{t('audit.who')}</th>
              <th className="px-5 py-2 font-medium">{t('audit.action')}</th>
              <th className="hidden px-5 py-2 font-medium md:table-cell">{t('audit.target')}</th>
              <th className="hidden px-5 py-2 font-medium lg:table-cell">{t('audit.ip')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {audit.data?.map((e) => (
              <tr key={e.id}>
                <td className="px-5 py-2 whitespace-nowrap text-zinc-500" title={dateTime(e.created_at)}>{timeAgo(e.created_at)}</td>
                <td className="px-5 py-2">{e.user_email ?? '—'}</td>
                <td className="px-5 py-2 font-mono text-xs">{e.action}</td>
                <td className="hidden max-w-xs truncate px-5 py-2 text-zinc-500 md:table-cell">{e.target}</td>
                <td className="hidden px-5 py-2 text-zinc-500 lg:table-cell">{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function UsersPage() {
  const { isSuperadmin, user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: ManagedUser[] }>('/api/users').then((r) => r.users) });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.get<{ projects: Project[] }>('/api/projects').then((r) => r.projects) });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleting(null);
      toast(t('users.deleted'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (users.isLoading || projects.isLoading) return <PageLoader />;
  const projectName = (id: number) => projects.data?.find((p) => p.id === id)?.name ?? `#${id}`;
  const canManage = (u: ManagedUser) => u.id === me?.id || (u.role !== 'superadmin' && (isSuperadmin || u.role === 'user'));

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          tab === 'users' && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('users.new')}
            </Button>
          )
        }
      />
      <Tabs
        tabs={[
          { value: 'users', label: t('users.tabUsers') },
          { value: 'audit', label: t('users.tabAudit') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'audit' ? (
        <AuditLog />
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {users.data?.map((u) => (
              <li key={u.id} className="flex items-start gap-3 px-5 py-4 sm:items-center">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    {u.role === 'superadmin' && (
                      <Badge tone="brand">
                        <ShieldCheck className="size-3" /> {t('role.superadmin')}
                      </Badge>
                    )}
                    {u.role === 'admin' && <Badge tone="brand">{t('role.admin')}</Badge>}
                    {!u.active && (
                      <Badge tone="red">
                        <UserX className="size-3" /> {t('users.inactive')}
                      </Badge>
                    )}
                    {u.id === me?.id && <Badge>{t('users.you')}</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">
                    {u.email} · {t('users.lastSignIn', timeAgo(u.last_login_at))}
                  </div>
                  {u.role === 'user' && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-amber-600">{t('users.noProject')}</span>
                      ) : (
                        u.memberships.map((m) => (
                          <Badge key={m.projectId}>
                            {projectName(m.projectId)} · {t(`memberRole.${m.role}`)}
                          </Badge>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {canManage(u) && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(u)} aria-label={t('users.editAria')}>
                      <Pencil className="size-4" />
                    </Button>
                    {u.id !== me?.id && u.role !== 'superadmin' && (
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(u)} aria-label={t('users.deleteAria')}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <UserEditor user={editing === 'new' ? undefined : editing} projects={projects.data ?? []} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={t('users.deleteConfirm', deleting?.name ?? '')}
        message={t('users.deleteMessage')}
      />
    </>
  );
}
