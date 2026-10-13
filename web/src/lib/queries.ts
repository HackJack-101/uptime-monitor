import { api } from './api';
import type { Monitor, Project, UptimeStat } from './types';

/**
 * Query definitions shared by several screens. A query key must always map to the same data shape,
 * otherwise a screen can read another screen's cached data (see the monitor edit → detail crash).
 */
export const monitorQuery = (id: number) => ({
  queryKey: ['monitor', id] as const,
  queryFn: () => api.get<{ monitor: Monitor; stats: Record<string, UptimeStat | null> }>(`/api/monitors/${id}`),
});

export const projectQuery = (id: number) => ({
  queryKey: ['project', id] as const,
  queryFn: () => api.get<{ project: Project }>(`/api/projects/${id}`).then((r) => r.project),
});
