import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, Modal, PageHeader, PageLoader, PasswordInput, Select, Switch, Tabs, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
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
      toast(user ? 'User updated' : 'User created');
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? `Edit ${user.name}` : 'New user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>
            Save user
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required htmlFor="u-name">
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" required htmlFor="u-email">
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={user ? 'New password' : 'Password'} required={!user} help={user ? 'Leave empty to keep the current password. Changing it signs the user out.' : 'At least 10 characters.'} htmlFor="u-pass">
            <PasswordInput id="u-pass" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Role" htmlFor="u-role" help={role === 'admin' ? 'Admins manage all projects and users.' : 'Users only access the projects assigned below.'}>
            <Select id="u-role" value={isSuper ? 'superadmin' : role} disabled={isSelf || isSuper || !isSuperadmin} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              {isSuper && <option value="superadmin">Superadmin</option>}
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
        {user && !isSelf && !isSuper && <Switch checked={active} onChange={setActive} label="Active" description="Inactive users cannot sign in." />}
        {role === 'user' && !isSuper && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Project access</h4>
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-500">No project exists yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200 dark:divide-zinc-800 dark:ring-zinc-800">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <Select
                      className="h-8 w-36 text-xs"
                      value={memberships.get(p.id) ?? ''}
                      onChange={(e) => {
                        const next = new Map(memberships);
                        if (e.target.value) next.set(p.id, e.target.value as MemberRole);
                        else next.delete(p.id);
                        setMemberships(next);
                      }}
                    >
                      <option value="">No access</option>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
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
      <CardHeader title="Audit log" description="The last 200 security-relevant actions." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="px-5 py-2 font-medium">When</th>
              <th className="px-5 py-2 font-medium">Who</th>
              <th className="px-5 py-2 font-medium">Action</th>
              <th className="hidden px-5 py-2 font-medium md:table-cell">Target</th>
              <th className="hidden px-5 py-2 font-medium lg:table-cell">IP</th>
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
      toast('User deleted');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (users.isLoading || projects.isLoading) return <PageLoader />;
  const projectName = (id: number) => projects.data?.find((p) => p.id === id)?.name ?? `#${id}`;
  const canManage = (u: ManagedUser) => u.id === me?.id || (u.role !== 'superadmin' && (isSuperadmin || u.role === 'user'));

  return (
    <>
      <PageHeader
        title="Users"
        description="One superadmin, admins with full access, and users scoped to projects."
        actions={
          tab === 'users' && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              New user
            </Button>
          )
        }
      />
      <Tabs
        tabs={[
          { value: 'users', label: 'Users' },
          { value: 'audit', label: 'Audit log' },
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
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    {u.role === 'superadmin' && (
                      <Badge tone="brand">
                        <ShieldCheck className="size-3" /> Superadmin
                      </Badge>
                    )}
                    {u.role === 'admin' && <Badge tone="brand">Admin</Badge>}
                    {!u.active && (
                      <Badge tone="red">
                        <UserX className="size-3" /> Inactive
                      </Badge>
                    )}
                    {u.id === me?.id && <Badge>You</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">
                    {u.email} · last sign-in {timeAgo(u.last_login_at)}
                  </div>
                  {u.role === 'user' && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-amber-600">No project assigned</span>
                      ) : (
                        u.memberships.map((m) => (
                          <Badge key={m.projectId}>
                            {projectName(m.projectId)} · {m.role}
                          </Badge>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {canManage(u) && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(u)} aria-label="Edit user">
                      <Pencil className="size-4" />
                    </Button>
                    {u.id !== me?.id && u.role !== 'superadmin' && (
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(u)} aria-label="Delete user">
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
        title={`Delete ${deleting?.name}?`}
        message="The account and its sessions will be removed immediately."
      />
    </>
  );
}
