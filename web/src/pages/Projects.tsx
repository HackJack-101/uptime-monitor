import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Textarea, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import type { Project } from '../lib/types';

export const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className="size-7 rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-zinc-900"
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px ${c}` : undefined }}
        />
      ))}
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]!);
  const create = useMutation({
    mutationFn: () => api.post<{ project: Project }>('/api/projects', { name, description, color }),
    onSuccess: ({ project }) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast('Project created');
      navigate(`/projects/${project.id}`);
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="New project"
      description="Projects group monitors, notification channels and members."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
        <Field label="Name" required htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
        </Field>
        <Field label="Description" htmlFor="p-desc">
          <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16 font-sans text-sm" />
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ProjectsPage() {
  const { isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.get<{ projects: Project[] }>('/api/projects').then((r) => r.projects), refetchInterval: 30_000 });

  if (projects.isLoading) return <PageLoader />;
  const list = projects.data ?? [];

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each web service belongs to exactly one project."
        actions={
          isAdmin && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban className="size-5" />}
            title="No projects"
            description={isAdmin ? 'Create your first project to start monitoring.' : 'You are not assigned to any project yet.'}
            action={isAdmin && <Button variant="primary" onClick={() => setCreating(true)}>Create project</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const s = p.statusCounts;
            const total = Object.values(s).reduce((a, b) => a + (b ?? 0), 0);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="group">
                <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 size-3 shrink-0 rounded" style={{ background: p.color }} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{p.name}</h3>
                      <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-sm text-zinc-500 dark:text-zinc-400">{p.description || 'No description'}</p>
                    </div>
                    {p.access === 'view' && <Badge>Read-only</Badge>}
                  </div>
                  <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    {total > 0 &&
                      (['up', 'degraded', 'down', 'pending', 'paused'] as const).map((k) =>
                        s[k] ? (
                          <div
                            key={k}
                            className={{ up: 'bg-emerald-500', degraded: 'bg-amber-500', down: 'bg-rose-500', pending: 'bg-sky-400', paused: 'bg-zinc-300 dark:bg-zinc-600' }[k]}
                            style={{ width: `${((s[k] ?? 0) / total) * 100}%` }}
                          />
                        ) : null,
                      )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      {total} monitor{total === 1 ? '' : 's'}
                      {(s.down ?? 0) > 0 && <span className="ml-2 font-medium text-rose-600 dark:text-rose-400">{s.down} down</span>}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" /> {p.memberCount ?? 0}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </>
  );
}
