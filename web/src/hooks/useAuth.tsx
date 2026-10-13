import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { MemberRole, Meta, User } from '../lib/types';

interface AuthState {
  user: User | null;
  memberships: { id: number; role: MemberRole }[];
  isAdmin: boolean;
  isSuperadmin: boolean;
  loading: boolean;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api.get<{ user: User; memberships: { id: number; role: MemberRole }[] }>('/api/auth/me').catch((err) => {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }),
    staleTime: 60_000,
  });

  useEffect(() => {
    const onExpired = () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [qc]);

  const user = me.data?.user ?? null;
  const value: AuthState = {
    user,
    memberships: me.data?.memberships ?? [],
    isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
    isSuperadmin: user?.role === 'superadmin',
    loading: me.isLoading,
    refresh: () => me.refetch(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/api/meta'), staleTime: Infinity });
}
