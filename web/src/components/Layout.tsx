import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Activity, BookOpen, FolderKanban, LayoutDashboard, LogOut, Menu, Monitor, Moon, Sun, UserCircle, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, useMeta } from '../hooks/useAuth';
import { api } from '../lib/api';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import type { Meta } from '../lib/types';

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ];
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80" role="radiogroup" aria-label="Theme">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => {
            setTheme(value);
            applyTheme(value);
          }}
          className={clsx(
            'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
            theme === value ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Version and short commit SHA of the running image; the full SHA is only shown on hover. */
function BuildInfo({ meta }: { meta: Meta }) {
  const sha = meta.shortCommit && (
    <span className="font-mono" title={meta.commit ?? undefined}>
      {meta.shortCommit}
    </span>
  );
  return (
    <p className="flex items-center gap-1.5 px-2 text-[11px] text-zinc-400">
      <span>v{meta.version}</span>
      {sha && (
        <>
          <span aria-hidden>·</span>
          {meta.commitUrl ? (
            <a href={meta.commitUrl} target="_blank" rel="noreferrer noopener" className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200" aria-label={`Commit ${meta.commit}`}>
              {sha}
            </a>
          ) : (
            sha
          )}
        </>
      )}
    </p>
  );
}

function NavItem({ to, icon: Icon, children, end }: { to: string; icon: typeof Activity; children: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-zinc-900/[0.04] text-zinc-900 dark:bg-white/[0.06] dark:text-white'
            : 'text-zinc-600 hover:bg-zinc-900/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </NavLink>
  );
}

function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { user, isAdmin } = useAuth();
  const meta = useMeta();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm shadow-brand-600/30">
          <Activity className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Uptime Monitor</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <NavItem to="/" icon={LayoutDashboard} end>
          Dashboard
        </NavItem>
        <NavItem to="/projects" icon={FolderKanban}>
          Projects
        </NavItem>
        {isAdmin && (
          <NavItem to="/users" icon={Users}>
            Users
          </NavItem>
        )}
        <NavItem to="/guide" icon={BookOpen}>
          Guide
        </NavItem>
      </nav>
      <div className="space-y-3">
        <ThemeToggle />
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 p-1.5 dark:border-zinc-800">
          <NavLink to="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/80">
            <UserCircle className="size-7 shrink-0 text-zinc-400" strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-zinc-500 capitalize">{user?.role}</div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        {meta.data && <BuildInfo meta={meta.data} />}
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => setOpen(false), [location.pathname]);

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    qc.clear();
    navigate('/login');
  };

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-200/80 bg-white/70 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/40 lg:block">
        <Sidebar onLogout={logout} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Activity className="size-3.5" />
          </div>
          <span className="font-semibold tracking-tight">Uptime Monitor</span>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="-mr-2 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-up bg-white shadow-2xl dark:bg-zinc-900">
            <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close menu">
              <X className="size-4" />
            </button>
            <Sidebar onLogout={logout} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
